import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeDatabase, listTransactions, openDatabase, saveTransactions } from "./database.js";
import { exportTransactionsToCsv, importTransactionsFromCsv, parseTransactionsCsv } from "./csv-backup.js";

async function createTestDatabase() {
  const database = openDatabase(":memory:");
  await initializeDatabase(database);
  return database;
}

function sampleTransactions() {
  return [
    { type: "expense", amount: 20000, note: "bensin", category: "transport", tags: [], rawAmount: "20000", original: "bensin 20000", confidence: 0.9 },
    { type: "income", amount: 100000, note: "refund", category: "income", tags: [], rawAmount: "100000", original: "refund 100000", confidence: 0.9 },
  ];
}

describe("csv backup", () => {
  it("exports active transactions to csv", async () => {
    const database = await createTestDatabase();
    await saveTransactions(database, sampleTransactions());

    const exported = await exportTransactionsToCsv(database);

    assert.equal(exported.count, 2);
    assert.match(exported.csv, /id,type,amount,note,category,payment_method,created_at_local,created_at/);
    assert.match(exported.csv, /bensin/);
    assert.match(exported.csv, /refund/);
  });

  it("parses exported csv and supports dry run import", async () => {
    const source = await createTestDatabase();
    await saveTransactions(source, sampleTransactions());
    const exported = await exportTransactionsToCsv(source);

    const dryRun = await importTransactionsFromCsv(await createTestDatabase(), exported.csv, { dryRun: true });

    assert.equal(dryRun.ok, true);
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.count, 2);
  });

  it("imports csv transactions when apply is enabled", async () => {
    const database = await createTestDatabase();
    const csv = [
      "id,type,amount,note,category,payment_method,created_at_local,created_at",
      '1,expense,20000,"bensin",transport,,"23 Apr 2026, 18.10 WIB",2026-04-23T11:10:00.000Z',
    ].join("\n");

    const result = await importTransactionsFromCsv(database, csv, { dryRun: false });

    assert.equal(result.ok, true);
    assert.equal(result.count, 1);
    assert.equal((await listTransactions(database)).length, 1);
  });

  it("rejects csv with missing required headers", () => {
    const parsed = parseTransactionsCsv("id,type,amount\n1,expense,20000");

    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /Header CSV kurang/);
  });
});
