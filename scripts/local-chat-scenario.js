import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { initializeDatabase, openDatabase } from "../src/database.js";
import { handleMessage } from "../src/message-handler.js";

const databasePath = resolve("data", "local-chat-scenario.sqlite");
const messages = [
  "+2jt gaji bca",
  "-20k bensin",
  "-makan ayam 27rb via qris #kantin",
  "1. -12k minimarket\n2. -8rb parkir\n3. +100k refund",
  "saldo",
  "riwayat",
  "kategori",
  "cari bensin",
  "hapus 2",
  "hari ini",
  "hapus terakhir",
  "saldo",
  "insight",
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
    const result = await handleMessage(database, message, insightTestOptions(message));
    results.push(result);

    console.log(`\nYou:\n${message}`);
    console.log("\nBot:");
    console.log(result.reply);
    console.log("-".repeat(48));
  }

  const finalBalance = results.at(-2)?.summary?.balance;

  assert.equal(finalBalance, 1953000);
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

function insightTestOptions(message) {
  if (message !== "insight") {
    return {};
  }

  return {
    generateFinanceInsight: async () => ({
      ok: false,
      fallback: true,
      reason: "ai_disabled",
    }),
  };
}
