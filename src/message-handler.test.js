import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  initializeDatabase,
  listBillReminders,
  listCategoryAliases,
  listCustomCategories,
  listRecurringRules,
  listTransactions,
  listWallets,
  openDatabase,
} from "./database.js";
import { getPeriodRange, handleMessage } from "./message-handler.js";

async function createTestDatabase() {
  const database = openDatabase(":memory:");
  await initializeDatabase(database);
  return database;
}

async function saveAiTransaction(database, { type = "expense", amount = 20000, note = "bensin", category = "transport", wallet = null, chatId } = {}) {
  return handleMessage(database, `${note} ${amount}`, {
    chatId,
    routeFinancialIntent: async () => ({
      ok: true,
      intent: "transaction_create",
      confidence: 0.9,
      transactions: [{ type, amount, note, category, wallet, confidence: 0.9 }],
    }),
  });
}

describe("message handler", () => {
  it("saves AI-routed transaction messages and returns a reply", async () => {
    const database = await createTestDatabase();
    let routeCalls = 0;
    const result = await handleMessage(database, "bensin 20k pakai cash", {
      routeFinancialIntent: async () => {
        routeCalls += 1;
        return {
          ok: true,
          intent: "transaction_create",
          confidence: 0.9,
          transactions: [{ type: "expense", amount: 20000, note: "bensin", category: "transport", wallet: "cash", confidence: 0.9 }],
        };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.kind, "ai_transactions");
    assert.equal(routeCalls, 1);
    assert.equal(result.saved.length, 1);
    assert.equal(result.summary.balance, -20000);
    assert.match(result.reply, /Tercatat: 1 transaksi/);
    assert.match(result.reply, /WIB/);
  });

  it("reports safe latency metrics without logging message text", async () => {
    const database = await createTestDatabase();
    const logs = [];

    const result = await handleMessage(database, "beli bensin 20k rahasia", {
      logger: (payload) => logs.push(payload),
      routeFinancialIntent: async () => ({
        ok: true,
        intent: "transaction_create",
        confidence: 0.9,
        transactions: [{ type: "expense", amount: 20000, note: "bensin", category: "transport", confidence: 0.9 }],
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.metrics.dbQueries >= 2, true);
    assert.equal(result.metrics.aiCalls, 1);
    assert.equal(Number.isFinite(result.metrics.totalMs), true);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].event, "message_performance");
    assert.equal(logs[0].kind, "ai_transactions");
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

  it("routes wallet-oriented natural income phrases through AI first", async () => {
    const database = await createTestDatabase();
    let routeCalls = 0;

    const examples = [
      ["topup gopay 100k", "gopay", 100000],
      ["isi saldo 150k ke dana", "dana", 150000],
      ["saldo awal cash 200k", "cash", 200000],
      ["masuk ke bca 500k gaji", "bca", 500000],
    ];

    for (const [message, wallet, amount] of examples) {
      const result = await handleMessage(database, message, {
        routeFinancialIntent: async () => {
          routeCalls += 1;
          return {
            ok: true,
            intent: "transaction_create",
            confidence: 0.9,
            transactions: [{ type: "income", amount, note: "saldo masuk", category: "income", wallet, confidence: 0.9 }],
          };
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.saved.at(-1).type, "income");
      assert.equal(result.saved.at(-1).wallet, wallet);
      assert.equal(result.saved.at(-1).amount, amount);
    }

    assert.equal(routeCalls, examples.length);
  });

  it("supports broader wallet and transfer command variants", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "buat dompet cash", { chatId: 123 });
    await handleMessage(database, "bikin dompet bca", { chatId: 123 });
    await handleMessage(database, "masuk ke bca 500k gaji", {
      chatId: 123,
      routeFinancialIntent: async () => ({
        ok: true,
        intent: "transaction_create",
        confidence: 0.9,
        transactions: [{ type: "income", amount: 500000, note: "gaji", category: "income", wallet: "bca", confidence: 0.9 }],
      }),
    });

    const transferA = await handleMessage(database, "transfer dari bca ke cash 120k isi tunai", { chatId: 123 });
    const transferB = await handleMessage(database, "pindah 30k dari cash ke bca balikin", { chatId: 123 });
    const wallets = await handleMessage(database, "saldo dompet", { chatId: 123 });

    assert.equal(transferA.command, "transfer_save");
    assert.equal(transferB.command, "transfer_save");
    assert.match(wallets.reply, /Cash: Rp\u00a090.000/);
    assert.match(wallets.reply, /Bca: Rp\u00a0410.000/);
  });

  it("supports wallet balance set and default wallet flows", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "dompet tambah bank", { chatId: 123 });
    const setBalance = await handleMessage(database, "set saldo dompet bank 70230", { chatId: 123 });
    const setDefault = await handleMessage(database, "default dompet bank", { chatId: 123 });
    const expense = await handleMessage(database, "20k makan", { chatId: 123, defaultTransactionType: "expense" });
    const wallets = await handleMessage(database, "dompet", { chatId: 123 });

    assert.equal(setBalance.command, "wallet_balance_set");
    assert.equal(setDefault.command, "wallet_default_set");
    assert.equal(expense.saved[0].wallet, "bank");
    assert.match(wallets.reply, /Dompet default: Bank/);
    assert.match(wallets.reply, /Bank: Rp\u00a050.230/);
  });

  it("supports wallet balance adjustment without changing finance summary", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "dompet tambah bank", { chatId: 123 });
    await handleMessage(database, "set saldo dompet bank 70k", { chatId: 123 });
    const adjusted = await handleMessage(database, "tambah saldo dompet bank 5k", { chatId: 123 });
    const balance = await handleMessage(database, "saldo", { chatId: 123 });
    const wallets = await handleMessage(database, "dompet", { chatId: 123 });

    assert.equal(adjusted.command, "wallet_balance_adjust");
    assert.equal(balance.summary.balance, 0);
    assert.match(wallets.reply, /Bank: Rp\u00a075.000/);
  });

  it("asks for wallet clarification when expense wallet is ambiguous", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "dompet tambah cash", { chatId: 123 });
    await handleMessage(database, "dompet tambah gopay", { chatId: 123 });

    const result = await handleMessage(database, "20k makan", { chatId: 123, defaultTransactionType: "expense" });

    assert.equal(result.kind, "clarification");
    assert.equal(result.command, "wallet_select_clarify");
    assert.match(result.reply, /dompet mana/i);
  });

  it("uses AI router for ambiguous wallet balance text", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "dompet tambah bank", { chatId: 123 });
    const result = await handleMessage(database, "saldo bank 70230", {
      chatId: 123,
      routeFinancialIntent: async () => ({
        ok: true,
        intent: "wallet_balance_set",
        wallet: "bank",
        amount: 70230,
        note: "saldo bank",
        confidence: 0.92,
      }),
    });

    assert.equal(result.kind, "clarification");
    assert.equal(result.command, "wallet_action_clarify");
    assert.match(result.reply, /1\. Set saldo dompet/);
    assert.match(result.reply, /2\. Catat pemasukan/);
    assert.match(result.reply, /3\. Batal/);
  });

  it("routes malformed transfer-like text through AI then falls back to numbered clarification", async () => {
    const database = await createTestDatabase();
    let routeCalls = 0;

    const result = await handleMessage(database, "transfer dari bca ke cash", {
      routeFinancialIntent: async () => {
        routeCalls += 1;
        return { ok: true, intent: "unknown_or_ambiguous", confidence: 0.8 };
      },
    });

    assert.equal(result.ok, false);
    assert.match(result.reply, /1\. Catat pengeluaran/);
    assert.match(result.reply, /2\. Catat pemasukan/);
    assert.match(result.reply, /3\. Bukan transaksi/);
    assert.equal(routeCalls, 1);
  });

  it("routes malformed wallet-like text through AI then falls back to numbered clarification", async () => {
    const database = await createTestDatabase();
    let routeCalls = 0;

    const result = await handleMessage(database, "topup gopay", {
      routeFinancialIntent: async () => {
        routeCalls += 1;
        return { ok: true, intent: "unknown_or_ambiguous", confidence: 0.8 };
      },
    });

    assert.equal(result.ok, false);
    assert.match(result.reply, /1\. Catat pengeluaran/);
    assert.match(result.reply, /2\. Catat pemasukan/);
    assert.match(result.reply, /3\. Bukan transaksi/);
    assert.equal(routeCalls, 1);
  });

  it("saves clear natural expense from AI router intent", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "beli bensin 20 ribu pakai cash", {
      routeFinancialIntent: async () => ({
        ok: true,
        intent: "transaction_create",
        confidence: 0.9,
        transactions: [{ type: "expense", amount: 20000, note: "bensin pakai cash", category: "transport", confidence: 0.9 }],
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.kind, "ai_transactions");
    assert.equal(result.saved[0].type, "expense");
    assert.equal(result.saved[0].amount, 20000);
    assert.match(result.saved[0].note, /bensin/i);
  });

  it("saves clear natural income from AI router intent", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "gaji freelance masuk 1,5 juta ke bca", {
      routeFinancialIntent: async () => ({
        ok: true,
        intent: "transaction_create",
        confidence: 0.9,
        transactions: [{ type: "income", amount: 1500000, note: "gaji freelance", category: "income", wallet: "bca", confidence: 0.9 }],
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.kind, "ai_transactions");
    assert.equal(result.saved[0].type, "income");
    assert.equal(result.saved[0].amount, 1500000);
    assert.match(result.saved[0].note, /gaji freelance/i);
    assert.equal(result.saved[0].wallet, "bca");
  });

  it("asks for explicit type when balance-style input is ambiguous", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "saldo bank 70000");

    assert.equal(result.ok, false);
    assert.match(result.reply, /1\. Catat pengeluaran/);
    assert.match(result.reply, /2\. Catat pemasukan/);
    assert.match(result.reply, /3\. Bukan transaksi/);
  });

  it("routes natural transfer intent through AI router", async () => {
    const database = await createTestDatabase();
    await handleMessage(database, "dompet tambah bca");
    await handleMessage(database, "dompet tambah cash");

    const result = await handleMessage(database, "bca ke cash 50 ribu", {
      routeFinancialIntent: async () => ({
        ok: true,
        intent: "wallet_transfer",
        confidence: 0.9,
        fromWallet: "bca",
        toWallet: "cash",
        amount: 50000,
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.command, "transfer_save");
    assert.equal(result.transfer.fromWallet, "bca");
    assert.equal(result.transfer.toWallet, "cash");
    assert.equal(result.transfer.amount, 50000);
  });

  it("routes natural finance question without tanya prefix", async () => {
    const database = await createTestDatabase();
    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "bensin", category: "transport" });
    await saveAiTransaction(database, { type: "expense", amount: 35000, note: "makan", category: "food" });

    const result = await handleMessage(database, "bulan ini boros di mana", {
      routeFinancialIntent: async () => ({ ok: true, intent: "finance_question", confidence: 0.9, question: "bulan ini boros di mana" }),
      answerFinanceQuestion: async () => ({ ok: true, content: "Paling banyak di transport." }),
    });

    assert.equal(result.command, "finance_question");
    assert.match(result.reply, /Paling banyak di transport/);
  });

  it("routes budget set with natural phrasing", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "budget makan 700 ribu bulan ini", {
      routeFinancialIntent: async () => ({ ok: true, intent: "budget_set", confidence: 0.9, category: "makan", amount: 700000, period: "monthly" }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.command, "budget_set");
    assert.equal(result.budget.category, "makan");
    assert.equal(result.budget.monthlyLimit, 700000);
  });

  it("routes AI report, budget check, search, export, and help intents", async () => {
    const database = await createTestDatabase();
    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "bensin", category: "transport" });

    const report = await handleMessage(database, "rekap minggu ini", {
      routeFinancialIntent: async () => ({ ok: true, intent: "report_request", confidence: 0.9, period: "week" }),
    });
    const budget = await handleMessage(database, "cek budget minggu ini", {
      routeFinancialIntent: async () => ({ ok: true, intent: "budget_check", confidence: 0.9, period: "weekly" }),
    });
    const search = await handleMessage(database, "cari bensin", {
      routeFinancialIntent: async () => ({ ok: true, intent: "search_transaction", confidence: 0.9, note: "bensin" }),
    });
    const exported = await handleMessage(database, "export csv", {
      routeFinancialIntent: async () => ({ ok: true, intent: "export_csv", confidence: 0.9 }),
    });
    const help = await handleMessage(database, "bantuan", {
      routeFinancialIntent: async () => ({ ok: true, intent: "help", confidence: 0.9 }),
    });

    assert.equal(report.command, "week_report");
    assert.equal(budget.command, "budget_list");
    assert.equal(search.command, "search");
    assert.equal(exported.command, "export");
    assert.equal(help.command, "help");
  });

  it("routes AI wallet, bill, and recurring creation intents", async () => {
    const database = await createTestDatabase();

    const wallet = await handleMessage(database, "buat dompet cash", {
      chatId: 123,
      routeFinancialIntent: async () => ({ ok: true, intent: "wallet_create", confidence: 0.9, wallet: "cash" }),
    });
    const bill = await handleMessage(database, "tagihan wifi 250k tiap tanggal 15", {
      chatId: 123,
      routeFinancialIntent: async () => ({ ok: true, intent: "bill_create", confidence: 0.9, note: "wifi", amount: 250000, dayOfMonth: 15, category: "bills" }),
    });
    const recurring = await handleMessage(database, "kos bulanan 500k", {
      chatId: 123,
      routeFinancialIntent: async () => ({ ok: true, intent: "recurring_create", confidence: 0.9, note: "kos", amount: 500000, frequency: "monthly", category: "housing" }),
    });

    assert.equal(wallet.command, "wallet_save");
    assert.equal((await listWallets(database, 123))[0].name, "cash");
    assert.equal(bill.command, "bill_save");
    assert.equal((await listBillReminders(database, 123))[0].title, "wifi");
    assert.equal(recurring.command, "recurring_save");
    assert.match((await listRecurringRules(database, 123))[0].templateMessage, /kos/);
  });

  it("asks for clarification when delete request uses description instead of ID", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "hapus transaksi bensin tadi");

    assert.equal(result.ok, false);
    assert.equal(result.command, "delete_by_text");
    assert.match(result.reply, /Hapus transaksi perlu ID/);
    assert.match(result.reply, /Cari dulu: bensin tadi/);
  });

  it("auto-saves clear AI extracted natural transactions after validation", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "bensin 20 ribu dan makan ayam 15 ribu tadi", {
      routeFinancialIntent: async () => ({
        ok: true,
        intent: "transaction_create",
        confidence: 0.9,
        transactions: [
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

    const result = await handleMessage(database, "saldo bank 50 ribu", {
      routeFinancialIntent: async () => ({
        ok: true,
        intent: "transaction_create",
        confidence: 0.9,
        transactions: [
          {
            type: "unknown",
            amount: 50000,
            note: "saldo bank",
            category: "other",
            confidence: 0.9,
          },
        ],
      }),
    });

    assert.equal(result.kind, "clarification");
    assert.match(result.reply, /1\. Pengeluaran/);
    assert.match(result.reply, /2\. Pemasukan/);
    assert.match(result.reply, /3\. Bukan transaksi/);
  });

  it("rejects low-confidence AI extracted transactions", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "catatan sesuatu 20 ribu", {
      routeFinancialIntent: async () => ({
        ok: true,
        intent: "transaction_create",
        confidence: 0.9,
        transactions: [
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
    assert.match(result.reply, /belum cukup jelas/i);
  });

  it("normalizes AI category suggestions to existing categories", async () => {
    const examples = [
      ["catatan alpha 20k", "ayam geprek dekat kampus", "makanan", "food"],
      ["catatan beta 50k", "praktikum elektronika", "praktikum", "education"],
      ["catatan gamma 80k", "oli motor", "vehicle", "transport"],
      ["catatan delta 700k", "bayar kos", "rent", "housing"],
      ["catatan epsilon 10k", "koleksi random", "hobby", "other"],
    ];

    for (const [message, note, suggestedCategory, expectedCategory] of examples) {
      const database = await createTestDatabase();
      const result = await handleMessage(database, message, {
        routeFinancialIntent: async () => ({
          ok: true,
          profile: "quick",
          latencyMs: 1,
          intent: "transaction_create",
          confidence: 0.9,
          transactions: [
            {
              type: "expense",
              amount: 20000,
              note,
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
      routeFinancialIntent: async () => ({
        ok: true,
        intent: "transaction_create",
        confidence: 0.9,
        transactions: [
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

    await saveAiTransaction(database, { type: "expense", amount: 25000, note: "ngopi", category: "other", chatId: 123 });
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

    await saveAiTransaction(database, { type: "income", amount: 100000, note: "refund", category: "income" });
    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "bensin", category: "transport" });

    const balance = await handleMessage(database, "saldo");
    const history = await handleMessage(database, "riwayat");

    assert.equal(balance.summary.balance, 80000);
    assert.match(balance.reply, /Saldo/);
    assert.equal(history.transactions.length, 2);
    assert.match(history.reply, /Riwayat terakhir/);
    assert.match(history.reply, /WIB/);
  });

  it("handles period reports with Jakarta date ranges", async () => {
    const database = await createTestDatabase();
    const now = new Date("2026-04-16T10:00:00.000Z");

    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "makan", category: "food" });

    const report = await handleMessage(database, "hari ini", { now });

    assert.equal(report.kind, "command");
    assert.equal(report.command, "today_report");
    assert.match(report.reply, /Ringkasan hari ini/);
  });

  it("shows timestamps in period reports that contain recent transactions", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "makan", category: "food" });

    const report = await handleMessage(database, "hari ini");

    assert.match(report.reply, /Transaksi terakhir/);
    assert.match(report.reply, /WIB/);
  });

  it("deletes the last transaction", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "expense", amount: 10000, note: "makan", category: "food" });
    await saveAiTransaction(database, { type: "income", amount: 50000, note: "cashback", category: "income" });

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

    await saveAiTransaction(database, { type: "expense", amount: 10000, note: "makan", category: "food", chatId: 123 });
    await saveAiTransaction(database, { type: "income", amount: 50000, note: "cashback", category: "income", chatId: 123 });
    await handleMessage(database, "hapus terakhir", { chatId: 123 });

    const restored = await handleMessage(database, "undo", { chatId: 123 });

    assert.equal(restored.command, "undo_delete");
    assert.equal(restored.restored.type, "income");
    assert.equal(restored.summary.balance, 40000);
    assert.match(restored.reply, /dikembalikan/);
  });

  it("deletes a transaction by id", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "expense", amount: 10000, note: "makan", category: "food" });
    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "bensin", category: "transport" });

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

    await saveAiTransaction(database, { type: "expense", amount: 10000, note: "makan", category: "food", chatId: 123 });

    const updated = await handleMessage(database, "edit 1 refund 25k", { chatId: 123, defaultTransactionType: "income" });
    const history = await handleMessage(database, "riwayat", { chatId: 123 });

    assert.equal(updated.command, "edit_by_id");
    assert.equal(updated.transaction.type, "income");
    assert.equal(updated.transaction.amount, 25000);
    assert.match(updated.reply, /Transaksi #1 diperbarui/);
    assert.match(history.reply, /refund/);
    assert.doesNotMatch(history.reply, /makan/);
  });

  it("does not delete or edit transactions across chat ids", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "expense", amount: 10000, note: "makan", category: "food", chatId: 123 });
    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "bensin", category: "transport", chatId: 456 });

    const deleteOther = await handleMessage(database, "hapus 2", { chatId: 123 });
    const editOther = await handleMessage(database, "edit 2 refund 25k", { chatId: 123, defaultTransactionType: "income" });
    const ownHistory = await handleMessage(database, "riwayat", { chatId: 123 });
    const otherHistory = await handleMessage(database, "riwayat", { chatId: 456 });

    assert.equal(deleteOther.ok, false);
    assert.equal(editOther.ok, false);
    assert.match(ownHistory.reply, /makan/);
    assert.doesNotMatch(ownHistory.reply, /bensin/);
    assert.match(otherHistory.reply, /bensin/);
    assert.doesNotMatch(otherHistory.reply, /refund/);
  });

  it("searches transactions", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "expense", amount: 10000, note: "makan", category: "food" });
    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "bensin", category: "transport" });

    const result = await handleMessage(database, "cari bensin");

    assert.equal(result.command, "search");
    assert.equal(result.transactions.length, 1);
    assert.match(result.reply, /bensin/);
    assert.doesNotMatch(result.reply, /makan/);
  });

  it("shows a category report", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "expense", amount: 10000, note: "makan", category: "food" });
    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "bensin", category: "transport" });

    const result = await handleMessage(database, "kategori");

    assert.equal(result.command, "category_report");
    assert.match(result.reply, /Laporan kategori/);
    assert.match(result.reply, /Makanan/);
    assert.match(result.reply, /Transport/);
  });

  it("returns a read-only manual insight fallback when AI is disabled", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "income", amount: 100000, note: "refund", category: "income" });
    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "makan", category: "food" });

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

    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "makan", category: "food" });

    const result = await handleMessage(database, "insight", {
      generateFinanceInsight: async (data) => ({
        ok: true,
        content: `AI membaca ${data.summary.transactionCount} transaksi.`,
      }),
    });

    assert.equal(result.command, "insight");
    assert.match(result.reply, /Ringkasan keuangan/);
    assert.match(result.reply, /Insight/);
    assert.match(result.reply, /AI membaca 1 transaksi/);
  });

  it("answers finance questions with code-calculated context and AI text", async () => {
    const database = await createTestDatabase();
    const now = new Date("2026-04-22T10:00:00.000Z");
    let capturedQuestion;
    let capturedData;

    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "bensin", category: "transport" });
    await saveAiTransaction(database, { type: "expense", amount: 15000, note: "makan", category: "food" });

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
    assert.match(result.reply, /Jawaban/);
    assert.match(result.reply, /Total bensin: 20000/);
    assert.doesNotMatch(result.reply, /\*\*/);
  });

  it("returns manual finance question fallback when AI is unavailable", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "bensin", category: "transport" });

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

  it("returns manual weekly ai report fallback when AI is unavailable", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "income", amount: 2000000, note: "gaji", category: "income", chatId: 123 });
    await saveAiTransaction(database, { type: "expense", amount: 200000, note: "transport mingguan", category: "transport", chatId: 123 });
    await handleMessage(database, "budget minggu global 300k", { chatId: 123 });
    await handleMessage(database, "dompet tambah cash", { chatId: 123 });

    const result = await handleMessage(database, "laporan ai minggu ini", {
      chatId: 123,
      generateWeeklyFinanceReport: async () => ({ ok: false, fallback: true, reason: "ai_disabled" }),
    });

    assert.equal(result.command, "weekly_ai_report");
    assert.match(result.reply, /Laporan mingguan AI/);
    assert.match(result.reply, /AI belum aktif/);
  });

  it("returns manual monthly ai review fallback when AI is unavailable", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "income", amount: 5000000, note: "gaji", category: "income", chatId: 123 });
    await saveAiTransaction(database, { type: "expense", amount: 700000, note: "kos", category: "housing", chatId: 123 });
    await handleMessage(database, "budget housing 1jt", { chatId: 123 });

    const result = await handleMessage(database, "review ai bulan ini", {
      chatId: 123,
      generateMonthlyFinanceReview: async () => ({ ok: false, fallback: true, reason: "ai_disabled" }),
    });

    assert.equal(result.command, "monthly_ai_review");
    assert.match(result.reply, /Review bulanan AI/);
    assert.match(result.reply, /AI belum aktif/);
  });

  it("returns anomaly report from app-calculated candidates with AI fallback", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "parkir", category: "transport", chatId: 123 });
    await saveAiTransaction(database, { type: "expense", amount: 25000, note: "parkir", category: "transport", chatId: 123 });
    await saveAiTransaction(database, { type: "expense", amount: 200000, note: "parkir bandara", category: "transport", chatId: 123 });

    const result = await handleMessage(database, "cek anomali", {
      chatId: 123,
      detectFinanceAnomalies: async () => ({ ok: false, fallback: true, reason: "ai_disabled" }),
    });

    assert.equal(result.command, "anomaly_report");
    assert.match(result.reply, /Cek anomali/);
    assert.match(result.reply, /parkir bandara/);
    assert.match(result.reply, /AI belum aktif/);
  });

  it("sets and shows monthly budget progress", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "expense", amount: 450000, note: "makan", category: "food", chatId: 123 });
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

    await saveAiTransaction(database, { type: "expense", amount: 90000, note: "makan", category: "food", chatId: 123 });
    await saveAiTransaction(database, { type: "expense", amount: 10000, note: "parkir", category: "transport", chatId: 123 });

    const saved = await handleMessage(database, "budget minggu global 120k", { chatId: 123 });
    const listed = await handleMessage(database, "cek budget minggu", { chatId: 123 });

    assert.equal(saved.command, "budget_set");
    assert.equal(saved.budget.category, "global");
    assert.equal(saved.budget.period, "weekly");
    assert.match(listed.reply, /Budget minggu ini/);
    assert.match(listed.reply, /Global: Rp\u00a0100.000 \/ Rp\u00a0120.000 \(83%\)/);
  });

  it("manages wallets and transfers without changing income expense summary logic", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "dompet tambah cash", { chatId: 123 });
    await handleMessage(database, "dompet tambah bca", { chatId: 123 });
    await saveAiTransaction(database, { type: "income", amount: 500000, note: "gaji", category: "income", wallet: "bca", chatId: 123 });
    await handleMessage(database, "transfer bca cash 100k isi cash", { chatId: 123 });

    const wallets = await handleMessage(database, "dompet", { chatId: 123 });
    const transfers = await handleMessage(database, "transfer", { chatId: 123 });
    const balance = await handleMessage(database, "saldo", { chatId: 123 });

    assert.match(wallets.reply, /Bca: Rp\u00a0400.000/);
    assert.match(wallets.reply, /Cash: Rp\u00a0100.000/);
    assert.match(transfers.reply, /bca -> cash/i);
    assert.equal(balance.summary.balance, 500000);
  });

  it("stores recurring transactions and bill reminders", async () => {
    const database = await createTestDatabase();

    const recurring = await handleMessage(database, "transaksi rutin tambah bulanan kos 500k kategori housing", { chatId: 123 });
    const recurringList = await handleMessage(database, "transaksi rutin", { chatId: 123 });
    const bill = await handleMessage(database, "tagihan tambah wifi 250k tiap 15 kategori bills", { chatId: 123 });
    const billList = await handleMessage(database, "tagihan", { chatId: 123 });

    assert.equal(recurring.command, "recurring_save");
    assert.match(recurringList.reply, /bulanan/);
    assert.equal(bill.command, "bill_save");
    assert.match(billList.reply, /wifi/);
  });

  it("scopes due bill reminders to the active chat", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "tagihan tambah wifi 250k tiap 15 kategori bills", { chatId: 123 });
    await handleMessage(database, "tagihan tambah listrik 400k tiap 15 kategori bills", { chatId: 456 });

    const due = await handleMessage(database, "tagihan hari ini", {
      chatId: 123,
      now: new Date("2026-04-15T09:00:00.000Z"),
    });

    assert.match(due.reply, /wifi/);
    assert.doesNotMatch(due.reply, /listrik/);
  });

  it("deletes budgets and requires reset instructions", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "budget food 700k", { chatId: 123 });

    const deleted = await handleMessage(database, "hapus budget food", { chatId: 123 });
    const reset = await handleMessage(database, "reset budget", { chatId: 123 });

    assert.equal(deleted.command, "budget_delete");
    assert.match(deleted.reply, /Budget Makanan bulan ini dihapus/);
    assert.equal(reset.command, "budget_reset");
    assert.match(reset.reply, /perlu konfirmasi/);
  });

  it("returns manual budget suggestion fallback", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "expense", amount: 90000, note: "makan", category: "food", chatId: 123 });
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

    await saveAiTransaction(database, { type: "expense", amount: 90000, note: "makan", category: "food", chatId: 123 });
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
    assert.match(result.reply, /Saran/);
    assert.match(result.reply, /Food sudah tinggi/);
    assert.doesNotMatch(result.reply, /\*\*/);
  });

  it("includes local timestamps in export csv", async () => {
    const database = await createTestDatabase();

    await saveAiTransaction(database, { type: "expense", amount: 10000, note: "makan", category: "food" });

    const exported = await handleMessage(database, "export csv");

    assert.match(exported.csv, /created_at_local/);
    assert.match(exported.csv, /WIB/);
    assert.match(exported.filename, /telegram-finance-bot-.*\.csv/);
  });

  it("returns reset instructions for reset command", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "reset data");

    assert.equal(result.command, "reset_data");
    assert.match(result.reply, /perlu konfirmasi/i);
  });

  it("calculates Jakarta period boundaries", () => {
    const range = getPeriodRange("today", new Date("2026-04-16T10:00:00.000Z"));

    assert.equal(range.from, "2026-04-15T17:00:00.000Z");
    assert.equal(range.to, "2026-04-16T17:00:00.000Z");
  });

  it("routes system commands directly without AI", async () => {
    const database = await createTestDatabase();
    let aiCalls = 0;

    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "bensin", category: "transport" });

    const commands = ["help", "saldo", "hari ini", "riwayat", "kategori", "insight", "export csv", "hapus terakhir"];

    for (const command of commands) {
      await handleMessage(database, command, {
        routeFinancialIntent: async () => {
          aiCalls += 1;
          return { ok: false, confidence: 0 };
        },
      });
    }

    assert.equal(aiCalls, 0);
  });

  it("routes hard commands (delete/edit by ID) directly without AI", async () => {
    const database = await createTestDatabase();
    let aiCalls = 0;

    await saveAiTransaction(database, { type: "expense", amount: 20000, note: "bensin", category: "transport", chatId: 123 });

    const deleteResult = await handleMessage(database, "hapus 1", {
      chatId: 123,
      routeFinancialIntent: async () => {
        aiCalls += 1;
        return { ok: false, confidence: 0 };
      },
    });

    await saveAiTransaction(database, { type: "expense", amount: 30000, note: "makan", category: "food", chatId: 123 });

    const editResult = await handleMessage(database, "edit 2 refund 50k", {
      chatId: 123,
      defaultTransactionType: "income",
      routeFinancialIntent: async () => {
        aiCalls += 1;
        return { ok: false, confidence: 0 };
      },
    });

    const correctionResult = await handleMessage(database, "koreksi kategori 2 transport", {
      chatId: 123,
      routeFinancialIntent: async () => {
        aiCalls += 1;
        return { ok: false, confidence: 0 };
      },
    });

    assert.equal(aiCalls, 0);
    assert.equal(deleteResult.command, "delete_by_id");
    assert.equal(editResult.command, "edit_by_id");
    assert.equal(correctionResult.command, "category_correction");
  });

  it("routes natural budget/wallet/transfer through AI first before fallback", async () => {
    const database = await createTestDatabase();
    let aiCalls = 0;

    await handleMessage(database, "dompet tambah cash", {
      chatId: 123,
      routeFinancialIntent: async () => {
        aiCalls += 1;
        return { ok: true, intent: "wallet_create", confidence: 0.9, wallet: "cash" };
      },
    });

    await handleMessage(database, "budget food 700k", {
      routeFinancialIntent: async () => {
        aiCalls += 1;
        return { ok: true, intent: "budget_set", confidence: 0.9, category: "food", amount: 700000, period: "monthly" };
      },
    });

    assert.equal(aiCalls, 2);
  });

  it("falls back to manual parser when AI returns low confidence", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "dompet tambah bank");

    const result = await handleMessage(database, "set saldo dompet bank 70k", {
      routeFinancialIntent: async () => ({
        ok: true,
        intent: "unknown",
        confidence: 0.3,
      }),
    });

    assert.equal(result.command, "wallet_balance_set");
    assert.match(result.reply, /Saldo bank diatur/);
  });

  it("rejects malformed AI transaction with low confidence", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "catatan sesuatu 20 ribu", {
      routeFinancialIntent: async () => ({
        ok: true,
        intent: "transaction_create",
        confidence: 0.9,
        transactions: [
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
    assert.match(result.reply, /belum cukup jelas/i);
  });
});
