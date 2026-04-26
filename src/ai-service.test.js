import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  answerFinanceQuestion,
  detectFinanceAnomalies,
  extractTransactionCandidates,
  generateBudgetSuggestion,
  generateFinanceInsight,
  generateMonthlyFinanceReview,
  generateWeeklyFinanceReport,
  isAiEnabled,
} from "./ai-service.js";

describe("ai service", () => {
  it("treats AI as disabled unless explicitly enabled", () => {
    assert.equal(isAiEnabled({}), false);
    assert.equal(isAiEnabled({ AI_ENABLED: "false" }), false);
    assert.equal(isAiEnabled({ AI_ENABLED: "true" }), true);
    assert.equal(isAiEnabled({ AI_ENABLED: " TRUE " }), true);
  });

  it("returns fallback when AI is disabled", async () => {
    const result = await generateFinanceInsight({}, { env: { AI_ENABLED: "false" } });

    assert.equal(result.ok, false);
    assert.equal(result.fallback, true);
    assert.equal(result.reason, "ai_disabled");
  });

  it("returns fallback when API key is missing", async () => {
    const result = await generateFinanceInsight({}, { env: { AI_ENABLED: "true" } });

    assert.equal(result.ok, false);
    assert.equal(result.fallback, true);
    assert.equal(result.reason, "missing_api_key");
  });

  it("uses OpenAI-compatible chat completions with safe summarized data", async () => {
    const calls = [];
    const client = {
      chat: {
        completions: {
          create: async (...args) => {
            calls.push(args);
            return {
              choices: [{ message: { content: "Pengeluaran terbesar ada di food." } }],
            };
          },
        },
      },
    };

    const result = await generateFinanceInsight(
      {
        periodLabel: "bulan ini",
        summary: {
          balance: 80000,
          totalIncome: 100000,
          totalExpense: 20000,
          transactionCount: 2,
        },
        categories: [{ category: "food", totalExpense: 20000, transactionCount: 1 }],
        recentTransactions: [
          {
            type: "expense",
            amount: 20000,
            note: "makan",
            category: "food",
            original: "makan 20k",
            createdAt: "2026-04-22T00:00:00.000Z",
          },
        ],
      },
      {
        client,
        env: {
          AI_ENABLED: "true",
          AI_API_KEY: "test-key",
          AI_BASE_URL: "https://ai.sumopod.com/v1",
          AI_MODEL: "MiniMax-M2.7-highspeed",
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.content, "Pengeluaran terbesar ada di food.");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0].model, "MiniMax-M2.7-highspeed");
    assert.equal(calls[0][0].temperature, 0.2);
    assert.equal(calls[0][0].max_tokens, 2500);
    assert.equal(calls[0][1].timeout, 25000);
    assert.equal(result.profile, "deep");
    assert.equal(Number.isFinite(result.latencyMs), true);
    assert.match(calls[0][0].messages[0].content, /Bahasa Indonesia/);
    assert.match(calls[0][0].messages[0].content, /Jangan mengarang nominal/);
    assert.doesNotMatch(calls[0][0].messages[1].content, /original/);
  });

  it("returns fallback when provider call fails", async () => {
    const client = {
      chat: {
        completions: {
          create: async () => {
            throw new Error("provider unavailable");
          },
        },
      },
    };

    const result = await generateFinanceInsight(
      {},
      { client, env: { AI_ENABLED: "true", AI_API_KEY: "test-key" } },
    );

    assert.equal(result.ok, false);
    assert.equal(result.fallback, true);
    assert.equal(result.reason, "provider_error");
  });

  it("answers finance questions with computed context only", async () => {
    const calls = [];
    const client = {
      chat: {
        completions: {
          create: async (...args) => {
            calls.push(args);
            return {
              choices: [{ message: { content: "Bensin bulan ini Rp20.000." } }],
            };
          },
        },
      },
    };

    const result = await answerFinanceQuestion(
      "berapa total bensin bulan ini?",
      {
        periodLabel: "bulan ini",
        summary: { totalIncome: 0, totalExpense: 20000, balance: -20000, transactionCount: 1 },
        categories: [{ category: "transport", totalExpense: 20000, transactionCount: 1 }],
        matchingTransactions: [
          {
            type: "expense",
            amount: 20000,
            note: "bensin",
            category: "transport",
            original: "bensin 20k",
          },
        ],
        matchedTerms: ["bensin"],
      },
      { client, env: { AI_ENABLED: "true", AI_API_KEY: "test-key" } },
    );

    assert.equal(result.ok, true);
    assert.equal(result.profile, "deep");
    assert.equal(result.content, "Bensin bulan ini Rp20.000.");
    assert.match(calls[0][0].messages[0].content, /Angka utama sudah dihitung/);
    assert.match(calls[0][0].messages[0].content, /tanpa Markdown/);
    assert.match(calls[0][0].messages[1].content, /berapa total bensin bulan ini/);
    assert.doesNotMatch(calls[0][0].messages[1].content, /original/);
  });

  it("generates budget suggestions from progress data", async () => {
    const calls = [];
    const client = {
      chat: {
        completions: {
          create: async (...args) => {
            calls.push(args);
            return {
              choices: [{ message: { content: "Food sudah 90%, kurangi jajan dulu." } }],
            };
          },
        },
      },
    };

    const result = await generateBudgetSuggestion(
      {
        periodLabel: "bulan ini",
        summary: { totalIncome: 0, totalExpense: 90000, balance: -90000, transactionCount: 1 },
        budgets: [
          {
            category: "food",
            monthlyLimit: 100000,
            spent: 90000,
            remaining: 10000,
            percent: 90,
            status: "warning",
          },
        ],
      },
      { client, env: { AI_ENABLED: "true", AI_API_KEY: "test-key" } },
    );

    assert.equal(result.ok, true);
    assert.equal(result.profile, "deep");
    assert.match(calls[0][0].messages[0].content, /progress budget/);
    assert.match(calls[0][0].messages[0].content, /tanpa Markdown/);
    assert.match(calls[0][0].messages[1].content, /"percent":90/);
  });

  it("extracts transaction candidates from strict JSON", async () => {
    const calls = [];
    const client = {
      chat: {
        completions: {
          create: async (...args) => {
            calls.push(args);
            return {
              choices: [
                {
                  message: {
                    content:
                      '{"transactions":[{"type":"expense","amount":20000,"note":"bensin","category":"transport","confidence":0.9}]}',
                  },
                },
              ],
            };
          },
        },
      },
    };

    const result = await extractTransactionCandidates(
      "tadi beli bensin 20 ribu",
      {},
      { client, env: { AI_ENABLED: "true", AI_API_KEY: "test-key" } },
    );

    assert.equal(result.ok, true);
    assert.equal(result.profile, "quick");
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].amount, 20000);
    assert.equal(calls[0][0].max_tokens, 700);
    assert.equal(calls[0][1].timeout, 12000);
    assert.match(calls[0][0].messages[0].content, /Balas JSON valid saja/);
  });

  it("returns fallback for malformed extraction JSON", async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: "bensin 20 ribu" } }],
          }),
        },
      },
    };

    const result = await extractTransactionCandidates(
      "tadi beli bensin 20 ribu",
      {},
      { client, env: { AI_ENABLED: "true", AI_API_KEY: "test-key" } },
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_json");
  });

  it("generates weekly finance report with summarized payload", async () => {
    const calls = [];
    const client = {
      chat: {
        completions: {
          create: async (...args) => {
            calls.push(args);
            return {
              choices: [{ message: { content: "Minggu ini pengeluaran transport paling menonjol." } }],
            };
          },
        },
      },
    };

    const result = await generateWeeklyFinanceReport(
      {
        periodLabel: "minggu ini",
        summary: { totalIncome: 500000, totalExpense: 150000, balance: 350000, transactionCount: 6 },
        categories: [{ category: "transport", totalExpense: 70000, transactionCount: 2 }],
        budgets: [{ category: "global", monthlyLimit: 200000, spent: 150000, remaining: 50000, percent: 75, status: "ok" }],
        wallets: [{ name: "cash", balance: 120000, income: 0, expense: 70000, transferIn: 0, transferOut: 0 }],
      },
      { client, env: { AI_ENABLED: "true", AI_API_KEY: "test-key" } },
    );

    assert.equal(result.ok, true);
    assert.equal(result.profile, "deep");
    assert.match(calls[0][0].messages[0].content, /laporan mingguan/);
    assert.match(calls[0][0].messages[1].content, /"wallets"/);
  });

  it("generates monthly finance review with budget context", async () => {
    const calls = [];
    const client = {
      chat: {
        completions: {
          create: async (...args) => {
            calls.push(args);
            return {
              choices: [{ message: { content: "Bulan ini budget food mendekati batas." } }],
            };
          },
        },
      },
    };

    const result = await generateMonthlyFinanceReview(
      {
        periodLabel: "bulan ini",
        summary: { totalIncome: 3000000, totalExpense: 1200000, balance: 1800000, transactionCount: 24 },
        budgets: [{ category: "food", monthlyLimit: 500000, spent: 420000, remaining: 80000, percent: 84, status: "warning" }],
      },
      { client, env: { AI_ENABLED: "true", AI_API_KEY: "test-key" } },
    );

    assert.equal(result.ok, true);
    assert.match(calls[0][0].messages[0].content, /review bulanan/);
    assert.match(calls[0][0].messages[1].content, /"percent":84/);
  });

  it("detects finance anomalies from app-calculated candidates", async () => {
    const calls = [];
    const client = {
      chat: {
        completions: {
          create: async (...args) => {
            calls.push(args);
            return {
              choices: [{ message: { content: "Parkir ini jauh di atas pola biasanya." } }],
            };
          },
        },
      },
    };

    const result = await detectFinanceAnomalies(
      {
        periodLabel: "30 hari terakhir",
        summary: { totalIncome: 0, totalExpense: 300000, balance: -300000, transactionCount: 8 },
        anomalies: [{ id: 8, note: "parkir bandara", category: "transport", amount: 120000, baseline: 30000, ratio: 4, reason: "category_spike" }],
      },
      { client, env: { AI_ENABLED: "true", AI_API_KEY: "test-key" } },
    );

    assert.equal(result.ok, true);
    assert.match(calls[0][0].messages[0].content, /deteksi anomali/);
    assert.match(calls[0][0].messages[1].content, /"baseline":30000/);
  });
});
