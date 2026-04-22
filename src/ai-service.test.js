import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  answerFinanceQuestion,
  extractTransactionCandidates,
  generateBudgetSuggestion,
  generateFinanceInsight,
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
            original: "-20k makan",
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
            original: "-20k bensin",
          },
        ],
        matchedTerms: ["bensin"],
      },
      { client, env: { AI_ENABLED: "true", AI_API_KEY: "test-key" } },
    );

    assert.equal(result.ok, true);
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
    assert.match(calls[0][0].messages[0].content, /progress budget/);
    assert.match(calls[0][0].messages[0].content, /tanpa Markdown/);
    assert.match(calls[0][0].messages[1].content, /"percent":90/);
  });

  it("extracts transaction candidates from strict JSON", async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content:
                    '{"transactions":[{"type":"expense","amount":20000,"note":"bensin","category":"transport","confidence":0.9}]}',
                },
              },
            ],
          }),
        },
      },
    };

    const result = await extractTransactionCandidates(
      "tadi beli bensin 20 ribu",
      {},
      { client, env: { AI_ENABLED: "true", AI_API_KEY: "test-key" } },
    );

    assert.equal(result.ok, true);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].amount, 20000);
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
});
