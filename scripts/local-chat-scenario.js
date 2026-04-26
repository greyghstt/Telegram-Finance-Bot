import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { initializeDatabase, openDatabase } from "../src/database.js";
import { handleMessage } from "../src/message-handler.js";

const databasePath = resolve("data", "local-chat-scenario.sqlite");
const messages = [
  "gaji masuk 2jt ke bca",
  "beli bensin 20k",
  "beli makan ayam 27rb via qris #kantin",
  "1. beli minimarket 12k\n2. bayar parkir 8rb\n3. refund 100k masuk",
  "saldo",
  "riwayat",
  "kategori",
  "cari bensin",
  "hapus 2",
  "hari ini",
  "hapus terakhir",
  "undo",
  "edit 3 makan ayam 30k",
  "saldo",
  "insight",
  "tanya bulan ini boros di mana?",
  "budget food 100k",
  "cek budget",
  "budget minggu global 120k",
  "cek budget minggu",
  "saran budget",
  "dompet tambah bca",
  "dompet tambah cash",
  "transfer bca cash 50k tarik tunai",
  "dompet",
  "transaksi rutin tambah bulanan 500k kos kategori housing",
  "transaksi rutin",
  "tagihan tambah wifi 250k tiap 15 kategori bills",
  "tagihan hari ini",
  "laporan ai minggu ini",
  "review ai bulan ini",
  "cek anomali",
  "kategori baru kopi Kopi",
  "alias kategori ngopi = kopi",
  "koreksi kategori 3 kopi",
  "help",
];

cleanupDatabase();

const database = openDatabase(databasePath);
await initializeDatabase(database);

try {
  console.log("Telegram Finance Bot - Local Chat Scenario");
  console.log("Temporary database:", databasePath);
  console.log("=".repeat(48));

  const results = [];

  for (const message of messages) {
    const result = await handleMessage(database, message, testOptions(message));
    results.push(result);

    console.log(`\nYou:\n${message}`);
    console.log("\nBot:");
    console.log(result.reply);
    console.log("-".repeat(48));
  }

  const finalBalance = results.findLast((result) => result.summary)?.summary?.balance;

  assert.equal(finalBalance, 2050000);
  assert.equal(results.every((result) => result.ok), true);

  console.log("\nAll local chat scenarios passed.");
  console.log(`Final balance after deleting the latest transaction: ${finalBalance}`);
} finally {
  database.close();
  cleanupDatabase();
}

function cleanupDatabase() {
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      unlinkSync(`${databasePath}${suffix}`);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

function testOptions(message) {
  return {
    defaultTransactionType: message.startsWith("edit ") ? "expense" : undefined,
    generateFinanceInsight: message === "insight" ? disabledAiResult : undefined,
    answerFinanceQuestion: message.startsWith("tanya ") ? disabledAiResult : undefined,
    generateBudgetSuggestion: message === "saran budget" ? disabledAiResult : undefined,
    generateWeeklyFinanceReport: message === "laporan ai minggu ini" ? disabledAiResult : undefined,
    generateMonthlyFinanceReview: message === "review ai bulan ini" ? disabledAiResult : undefined,
    detectFinanceAnomalies: message === "cek anomali" ? disabledAiResult : undefined,
    routeFinancialIntent: buildLocalAiIntent(message),
  };
}

function buildLocalAiIntent(message) {
  const intents = new Map([
    [
      "gaji masuk 2jt ke bca",
      {
        intent: "transaction_create",
        transactions: [
          { type: "income", amount: 2000000, note: "gaji", category: "income", wallet: "bca", confidence: 0.95 },
        ],
      },
    ],
    [
      "beli bensin 20k",
      {
        intent: "transaction_create",
        transactions: [
          { type: "expense", amount: 20000, note: "bensin", category: "transport", confidence: 0.95 },
        ],
      },
    ],
    [
      "beli makan ayam 27rb via qris #kantin",
      {
        intent: "transaction_create",
        transactions: [
          { type: "expense", amount: 27000, note: "makan ayam", category: "food", confidence: 0.95 },
        ],
      },
    ],
    [
      "1. beli minimarket 12k\n2. bayar parkir 8rb\n3. refund 100k masuk",
      {
        intent: "transaction_create",
        transactions: [
          { type: "expense", amount: 12000, note: "minimarket", category: "groceries", confidence: 0.95 },
          { type: "expense", amount: 8000, note: "parkir", category: "transport", confidence: 0.95 },
          { type: "income", amount: 100000, note: "refund", category: "income", confidence: 0.95 },
        ],
      },
    ],
    [
      "topup gopay 100k",
      {
        intent: "transaction_create",
        transactions: [
          { type: "income", amount: 100000, note: "topup gopay", category: "income", wallet: "gopay", confidence: 0.95 },
        ],
      },
    ],
    [
      "isi saldo 150k ke dana",
      {
        intent: "transaction_create",
        transactions: [
          { type: "income", amount: 150000, note: "isi saldo", category: "income", wallet: "dana", confidence: 0.95 },
        ],
      },
    ],
    [
      "saldo awal cash 200k",
      {
        intent: "wallet_balance_set",
        wallet: "cash",
        amount: 200000,
        note: "saldo awal",
      },
    ],
    [
      "masuk ke bca 500k gaji",
      {
        intent: "transaction_create",
        transactions: [
          { type: "income", amount: 500000, note: "gaji", category: "income", wallet: "bca", confidence: 0.95 },
        ],
      },
    ],
  ]);

  const intent = intents.get(message);
  if (!intent) {
    return undefined;
  }

  return async () => ({
    ok: true,
    confidence: 0.95,
    ...intent,
  });
}

async function disabledAiResult() {
  return {
    ok: false,
    fallback: true,
    reason: "ai_disabled",
  };
}
