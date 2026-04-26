import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyWalletIntent,
  extractTransactionCandidates,
  routeFinancialIntent,
} from "./ai-router.js";

describe("ai router", () => {
  it("routes financial intent from provider JSON", async () => {
    const result = await routeFinancialIntent(
      "bulan ini aman?",
      {},
      {
        env: { AI_ENABLED: "true", AI_API_KEY: "test-key" },
        client: jsonClient({ intent: "finance_question", confidence: 0.92, question: "bulan ini aman?" }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.intent, "finance_question");
    assert.equal(result.question, "bulan ini aman?");
  });

  it("maps routed transactions to candidates", async () => {
    const result = await extractTransactionCandidates(
      "bensin 20k",
      {},
      {
        env: { AI_ENABLED: "true", AI_API_KEY: "test-key" },
        client: jsonClient({
          intent: "transaction_create",
          confidence: 0.9,
          transactions: [{ type: "expense", amount: 20000, note: "bensin", category: "transport", wallet: null, confidence: 0.9 }],
        }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].amount, 20000);
  });

  it("classifies wallet intent from provider JSON", async () => {
    const result = await classifyWalletIntent(
      "set saldo cash 100k",
      {},
      {
        env: { AI_ENABLED: "true", AI_API_KEY: "test-key" },
        client: jsonClient({ intent: "wallet_balance_set", wallet: "cash", amount: 100000, confidence: 0.91 }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.intent, "wallet_balance_set");
    assert.equal(result.wallet, "cash");
    assert.equal(result.amount, 100000);
  });

  it("fails closed on malformed JSON", async () => {
    const result = await routeFinancialIntent("apa ini", {}, {
      env: { AI_ENABLED: "true", AI_API_KEY: "test-key" },
      client: textClient("bukan json"),
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_json");
  });
});

function jsonClient(value) {
  return textClient(JSON.stringify(value));
}

function textClient(content) {
  return {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content } }] }),
      },
    },
  };
}
