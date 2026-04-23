import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeDatabase, listTransactions, openDatabase, saveTransactions } from "./database.js";
import { exportTransactionsToCsv, importTransactionsFromCsv, parseTransactionsCsv } from "./csv-backup.js";
import { parseInput } from "./parser.js";

async function createTestDatabase() {
  const database = openDatabase(":memory:");
  await initializeDatabase(database);
  return database;
}

describe("csv backup", () => {
  it("exports active transactions to csv", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-20k bensin\n+100k refund");
    await saveTransactions(database, parsed.transactions);

    const exported = await exportTransactionsToCsv(database);

    assert.equal(exported.count, 2);
    assert.match(exported.csv, /id,type,amount,note,category,payment_method,created_at_local,created_at/);
    assert.match(exported.csv, /bensin/);
    assert.match(exported.csv, /refund/);
  });

  it("parses exported csv and supports dry run import", async () => {
    const source = await createTestDatabase();
    const parsed = parseInput("-20k bensin\n+100k refund");
    await saveTransactions(source, parsed.transactions);
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
