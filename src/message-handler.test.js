import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  initializeDatabase,
  listCategoryAliases,
  listCustomCategories,
  listTransactions,
  openDatabase,
} from "./database.js";
import { getPeriodRange, handleMessage } from "./message-handler.js";

async function createTestDatabase() {
  const database = openDatabase(":memory:");
  await initializeDatabase(database);
  return database;
}

describe("message handler", () => {
  it("saves transaction messages and returns a reply", async () => {
    const database = await createTestDatabase();
    const result = await handleMessage(database, "-20k bensin");

    assert.equal(result.ok, true);
    assert.equal(result.saved.length, 1);
    assert.equal(result.summary.balance, -20000);
    assert.match(result.reply, /Tersimpan: 1 transaksi/);
    assert.match(result.reply, /WIB/);
  });

  it("reports safe latency metrics without logging message text", async () => {
    const database = await createTestDatabase();
    const logs = [];

    const result = await handleMessage(database, "-20k bensin rahasia", {
      logger: (payload) => logs.push(payload),
    });

    assert.equal(result.ok, true);
    assert.equal(result.metrics.dbQueries, 2);
    assert.equal(result.metrics.aiCalls, 0);
    assert.equal(Number.isFinite(result.metrics.totalMs), true);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].event, "message_performance");
    assert.equal(logs[0].kind, "transaction");
    assert.doesNotMatch(JSON.stringify(logs[0]), /rahasia/);
  });

  it("saves unsigned transactions when input mode provides the type", async () => {
    const database = await createTestDatabase();

    const expense = await handleMessage(database, "20k bensin", {
      defaultTransactionType: "expense",
    });
    const income = await handleMessage(database, "500k gaji", {
      defaultTransactionType: "income",
    });

    assert.equal(expense.saved[0].type, "expense");
    assert.equal(income.saved[0].type, "income");
    assert.equal(income.summary.balance, 480000);
  });

  it("auto-saves clear AI extracted natural transactions after validation", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "tadi beli bensin 20 ribu dan makan ayam 15 ribu", {
      extractTransactionCandidates: async () => ({
        ok: true,
        candidates: [
          {
            type: "expense",
            amount: 20000,
            note: "bensin",
            category: "transport",
            confidence: 0.9,
          },
          {
            type: "expense",
            amount: 15000,
            note: "makan ayam",
            category: "food",
            confidence: 0.9,
          },
        ],
      }),
    });

    assert.equal(result.kind, "ai_transactions");
    assert.equal(result.saved.length, 2);
    assert.equal(result.summary.balance, -35000);
  });

  it("asks for clarification instead of saving ambiguous AI extracted transactions", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "refund teman 50 ribu", {
      extractTransactionCandidates: async () => ({
        ok: true,
        candidates: [
          {
            type: "unknown",
            amount: 50000,
            note: "refund teman",
            category: "other",
            confidence: 0.9,
          },
        ],
      }),
    });

    assert.equal(result.kind, "clarification");
    assert.match(result.reply, /Belum ada transaksi yang disimpan/);
  });

  it("rejects low-confidence AI extracted transactions", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "mungkin bayar sesuatu 20 ribu", {
      extractTransactionCandidates: async () => ({
        ok: true,
        candidates: [
          {
            type: "expense",
            amount: 20000,
            note: "sesuatu",
            category: "other",
            confidence: 0.4,
          },
        ],
      }),
    });

    assert.equal(result.ok, false);
    assert.match(result.reply, /belum bisa memvalidasi/i);
  });

  it("normalizes AI category suggestions to existing categories", async () => {
    const examples = [
      ["ayam geprek dekat kampus 20k", "makanan", "food"],
      ["praktikum elektronika 50k", "praktikum", "education"],
      ["oli motor 80k", "vehicle", "transport"],
      ["bayar kos 700k", "rent", "housing"],
      ["koleksi random 10k", "hobby", "other"],
    ];

    for (const [message, suggestedCategory, expectedCategory] of examples) {
      const database = await createTestDatabase();
      const result = await handleMessage(database, message, {
        extractTransactionCandidates: async () => ({
          ok: true,
          profile: "quick",
          latencyMs: 1,
          candidates: [
            {
              type: "expense",
              amount: 20000,
              note: message.replace(/\s+\d+k$/i, ""),
              category: suggestedCategory,
              confidence: 0.9,
            },
          ],
        }),
      });

      assert.equal(result.kind, "ai_transactions");
      assert.equal(result.saved[0].category, expectedCategory);
    }
  });

  it("saves custom categories and category aliases", async () => {
    const database = await createTestDatabase();

    const category = await handleMessage(database, "kategori baru kopi Kopi", { chatId: 123 });
    const alias = await handleMessage(database, "alias kategori ngopi = kopi", { chatId: 123 });

    const categories = await listCustomCategories(database, 123);
    const aliases = await listCategoryAliases(database, 123);

    assert.equal(category.command, "custom_category_save");
    assert.match(category.reply, /Kategori disimpan/);
    assert.equal(alias.command, "category_alias_save");
    assert.match(alias.reply, /ngopi -> Kopi/);
    assert.equal(categories[0].category, "kopi");
    assert.equal(categories[0].label, "Kopi");
    assert.equal(aliases[0].alias, "ngopi");
    assert.equal(aliases[0].category, "kopi");
  });

  it("uses stored category aliases for AI category suggestions", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "kategori baru kopi Kopi", { chatId: 123 });
    await handleMessage(database, "alias kategori ngopi = kopi", { chatId: 123 });

    const result = await handleMessage(database, "ngopi 25k", {
      chatId: 123,
      extractTransactionCandidates: async () => ({
        ok: true,
        candidates: [
          {
            type: "expense",
            amount: 25000,
            note: "ngopi",
            category: "ngopi",
            confidence: 0.9,
          },
        ],
      }),
    });

    assert.equal(result.kind, "ai_transactions");
    assert.equal(result.saved[0].category, "kopi");
  });

  it("corrects transaction categories and stores a note alias", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-25k ngopi kategori other", { chatId: 123 });
    const corrected = await handleMessage(database, "koreksi kategori 1 kopi", { chatId: 123 });
    const transactions = await listTransactions(database);
    const aliases = await listCategoryAliases(database, 123);

    assert.equal(corrected.command, "category_correction");
    assert.equal(corrected.transaction.category, "kopi");
    assert.equal(transactions[0].category, "kopi");
    assert.equal(aliases[0].alias, "ngopi");
    assert.equal(aliases[0].category, "kopi");
  });

  it("handles balance and history commands", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "+100k refund");
    await handleMessage(database, "-20k bensin");

    const balance = await handleMessage(database, "saldo");
    const history = await handleMessage(database, "riwayat");

    assert.equal(balance.summary.balance, 80000);
    assert.match(balance.reply, /Saldo saat ini/);
    assert.equal(history.transactions.length, 2);
    assert.match(history.reply, /Riwayat transaksi terakhir/);
    assert.match(history.reply, /WIB/);
  });

  it("handles period reports with Jakarta date ranges", async () => {
    const database = await createTestDatabase();
    const now = new Date("2026-04-16T10:00:00.000Z");

    await handleMessage(database, "-20k makan");

    const report = await handleMessage(database, "hari ini", { now });

    assert.equal(report.kind, "command");
    assert.equal(report.command, "today_report");
    assert.match(report.reply, /Ringkasan hari ini/);
  });

  it("shows timestamps in period reports that contain recent transactions", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-20k makan");

    const report = await handleMessage(database, "hari ini");

    assert.match(report.reply, /Transaksi terakhir/);
    assert.match(report.reply, /WIB/);
  });

  it("deletes the last transaction", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-10k makan");
    await handleMessage(database, "+50k cashback");

    const deleted = await handleMessage(database, "hapus terakhir");

    assert.equal(deleted.ok, true);
    assert.equal(deleted.deleted.type, "income");
    assert.ok(deleted.deleted.deletedAt);
    assert.equal(deleted.summary.balance, -10000);
    assert.match(deleted.reply, /WIB/);
    assert.match(deleted.reply, /Ketik undo/);
  });

  it("undoes the last soft delete", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-10k makan", { chatId: 123 });
    await handleMessage(database, "+50k cashback", { chatId: 123 });
    await handleMessage(database, "hapus terakhir", { chatId: 123 });

    const restored = await handleMessage(database, "undo", { chatId: 123 });

    assert.equal(restored.command, "undo_delete");
    assert.equal(restored.restored.type, "income");
    assert.equal(restored.summary.balance, 40000);
    assert.match(restored.reply, /dikembalikan/);
  });

  it("deletes a transaction by id", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-10k makan");
    await handleMessage(database, "-20k bensin");

    const deleted = await handleMessage(database, "hapus 1");
    const history = await handleMessage(database, "riwayat");

    assert.equal(deleted.ok, true);
    assert.equal(deleted.deleted.id, 1);
    assert.match(deleted.reply, /Transaksi #1 dihapus/);
    assert.doesNotMatch(history.reply, /makan/);
    assert.match(history.reply, /bensin/);
  });

  it("edits a transaction by id", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-10k makan", { chatId: 123 });

    const updated = await handleMessage(database, "edit 1 +25k refund", { chatId: 123 });
    const history = await handleMessage(database, "riwayat", { chatId: 123 });

    assert.equal(updated.command, "edit_by_id");
    assert.equal(updated.transaction.type, "income");
    assert.equal(updated.transaction.amount, 25000);
    assert.match(updated.reply, /Transaksi #1 diperbarui/);
    assert.match(history.reply, /refund/);
    assert.doesNotMatch(history.reply, /makan/);
  });

  it("searches transactions", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-10k makan");
    await handleMessage(database, "-20k bensin");

    const result = await handleMessage(database, "cari bensin");

    assert.equal(result.command, "search");
    assert.equal(result.transactions.length, 1);
    assert.match(result.reply, /bensin/);
    assert.doesNotMatch(result.reply, /makan/);
  });

  it("shows a category report", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-10k makan");
    await handleMessage(database, "-20k bensin");

    const result = await handleMessage(database, "kategori");

    assert.equal(result.command, "category_report");
    assert.match(result.reply, /Laporan kategori/);
    assert.match(result.reply, /Makanan/);
    assert.match(result.reply, /Transport/);
  });

  it("returns a read-only manual insight fallback when AI is disabled", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "+100k refund");
    await handleMessage(database, "-20k makan");

    const result = await handleMessage(database, "insight", {
      generateFinanceInsight: async (data) => ({
        ok: false,
        fallback: true,
        reason: "ai_disabled",
        data,
      }),
    });

    assert.equal(result.command, "insight");
    assert.equal(result.summary.balance, 80000);
    assert.equal(result.categories.length, 2);
    assert.equal(result.recentTransactions.length, 2);
    assert.equal(result.ai.reason, "ai_disabled");
    assert.match(result.reply, /Ringkasan keuangan/);
    assert.match(result.reply, /ringkasan manual/);
    assert.match(result.reply, /Saldo: Rp\u00a080.000/);
  });

  it("uses AI insight content when generation succeeds", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-20k makan");

    const result = await handleMessage(database, "analisa", {
      generateFinanceInsight: async (data) => ({
        ok: true,
        content: `AI membaca ${data.summary.transactionCount} transaksi.`,
      }),
    });

    assert.equal(result.command, "insight");
    assert.match(result.reply, /Ringkasan keuangan/);
    assert.match(result.reply, /Insight AI/);
    assert.match(result.reply, /AI membaca 1 transaksi/);
  });

  it("answers finance questions with code-calculated context and AI text", async () => {
    const database = await createTestDatabase();
    const now = new Date("2026-04-22T10:00:00.000Z");
    let capturedQuestion;
    let capturedData;

    await handleMessage(database, "-20k bensin");
    await handleMessage(database, "-15k makan");

    const result = await handleMessage(database, "tanya berapa total bensin bulan ini?", {
      now,
      answerFinanceQuestion: async (question, data) => {
        capturedQuestion = question;
        capturedData = data;
        return {
          ok: true,
          content: `**Total bensin**: ${data.matchingSummary.totalExpense}.\n- Masih kecil.`,
        };
      },
    });

    assert.equal(result.command, "finance_question");
    assert.equal(capturedQuestion, "berapa total bensin bulan ini?");
    assert.equal(capturedData.periodLabel, "bulan ini");
    assert.equal(capturedData.summary.totalExpense, 35000);
    assert.equal(capturedData.matchingSummary.totalExpense, 20000);
    assert.match(result.reply, /Jawaban keuangan/);
    assert.match(result.reply, /Data cocok: bensin/);
    assert.match(result.reply, /Jawaban AI/);
    assert.match(result.reply, /Total bensin: 20000/);
    assert.doesNotMatch(result.reply, /\*\*/);
  });

  it("returns manual finance question fallback when AI is unavailable", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-20k bensin");

    const result = await handleMessage(database, "/tanya bulan ini boros di mana?", {
      answerFinanceQuestion: async () => ({
        ok: false,
        fallback: true,
        reason: "provider_error",
      }),
    });

    assert.equal(result.command, "finance_question");
    assert.match(result.reply, /Jawaban keuangan/);
    assert.match(result.reply, /ringkasan manual/);
    assert.match(result.reply, /Kategori utama/);
  });

  it("sets and shows monthly budget progress", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-450k makan kategori food");
    const saved = await handleMessage(database, "budget food 700k", { chatId: 123 });
    const listed = await handleMessage(database, "cek budget", { chatId: 123 });

    assert.equal(saved.command, "budget_set");
    assert.match(saved.reply, /Budget Makanan disimpan/);
    assert.equal(listed.budgets[0].category, "food");
    assert.equal(listed.budgets[0].spent, 450000);
    assert.equal(listed.budgets[0].percent, 64);
    assert.match(listed.reply, /Rp\u00a0450.000 \/ Rp\u00a0700.000 \(64%\)/);
  });

  it("supports global and weekly budget commands", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-90k makan kategori food");
    await handleMessage(database, "-10k parkir kategori transport");

    const saved = await handleMessage(database, "budget minggu global 120k", { chatId: 123 });
    const listed = await handleMessage(database, "cek budget minggu", { chatId: 123 });

    assert.equal(saved.command, "budget_set");
    assert.equal(saved.budget.category, "global");
    assert.equal(saved.budget.period, "weekly");
    assert.match(listed.reply, /Budget minggu ini/);
    assert.match(listed.reply, /Global: Rp\u00a0100.000 \/ Rp\u00a0120.000 \(83%\)/);
  });

  it("deletes budgets and requires reset instructions", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "budget food 700k", { chatId: 123 });

    const deleted = await handleMessage(database, "hapus budget food", { chatId: 123 });
    const reset = await handleMessage(database, "reset budget", { chatId: 123 });

    assert.equal(deleted.command, "budget_delete");
    assert.match(deleted.reply, /Budget Makanan bulan ini dihapus/);
    assert.equal(reset.command, "budget_reset");
    assert.match(reset.reply, /butuh konfirmasi/);
  });

  it("returns manual budget suggestion fallback", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-90k makan kategori food");
    await handleMessage(database, "budget food 100k", { chatId: 123 });

    const result = await handleMessage(database, "saran budget", {
      chatId: 123,
      generateBudgetSuggestion: async () => ({
        ok: false,
        fallback: true,
        reason: "ai_disabled",
      }),
    });

    assert.equal(result.command, "budget_suggestion");
    assert.match(result.reply, /Saran budget bulan ini/);
    assert.match(result.reply, /Makanan sudah mendekati batas/);
  });

  it("wraps and sanitizes AI budget suggestions", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-90k makan kategori food");
    await handleMessage(database, "budget food 100k", { chatId: 123 });

    const result = await handleMessage(database, "saran budget", {
      chatId: 123,
      generateBudgetSuggestion: async () => ({
        ok: true,
        content: "**Food** sudah tinggi.\n- Tahan jajan dulu.",
      }),
    });

    assert.equal(result.command, "budget_suggestion");
    assert.match(result.reply, /Saran budget bulan ini/);
    assert.match(result.reply, /Saran AI/);
    assert.match(result.reply, /Food sudah tinggi/);
    assert.doesNotMatch(result.reply, /\*\*/);
  });

  it("includes local timestamps in export csv", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-10k makan");

    const exported = await handleMessage(database, "export csv");

    assert.match(exported.csv, /created_at_local/);
    assert.match(exported.csv, /WIB/);
    assert.match(exported.filename, /telegram-finance-bot-.*\.csv/);
  });

  it("returns reset instructions for reset command", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "reset data");

    assert.equal(result.command, "reset_data");
    assert.match(result.reply, /butuh konfirmasi/i);
  });

  it("calculates Jakarta period boundaries", () => {
    const range = getPeriodRange("today", new Date("2026-04-16T10:00:00.000Z"));

    assert.equal(range.from, "2026-04-15T17:00:00.000Z");
    assert.equal(range.to, "2026-04-16T17:00:00.000Z");
  });
});
