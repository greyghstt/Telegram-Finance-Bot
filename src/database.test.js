import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearAllTransactions,
  clearChatSessionPendingAction,
  deleteLastTransaction,
  deleteTransactionById,
  getDatabaseStatus,
  getChatSession,
  getSummary,
  initializeDatabase,
  listTransactions,
  openDatabase,
  saveTransaction,
  saveTransactions,
  searchTransactions,
  setChatSessionPendingAction,
} from "./database.js";
import { parseInput } from "./parser.js";

async function createTestDatabase() {
  const database = openDatabase(":memory:");
  await initializeDatabase(database);
  return database;
}

describe("database", () => {
  it("initializes schema", async () => {
    const database = await createTestDatabase();

    assert.deepEqual(await getDatabaseStatus(database), {
      ok: true,
      kind: "sqlite",
      migrations: 1,
      transactions: 0,
      chatSessions: 0,
    });
  });

  it("saves a parsed transaction", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-20k bensin");
    const saved = await saveTransaction(database, parsed.transaction);

    assert.equal(saved.id, 1);
    assert.equal(saved.type, "expense");
    assert.equal(saved.amount, 20000);
    assert.equal(saved.note, "bensin");
    assert.equal(saved.category, "transport");
  });

  it("saves batch transactions and calculates summary", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-12k alfamid\n-20k bensin\n+100k refund");
    const saved = await saveTransactions(database, parsed.transactions);
    const summary = await getSummary(database);

    assert.equal(saved.length, 3);
    assert.equal(summary.totalExpense, 32000);
    assert.equal(summary.totalIncome, 100000);
    assert.equal(summary.balance, 68000);
    assert.equal(summary.transactionCount, 3);
  });

  it("lists and deletes last transaction", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-10k makan\n+50k cashback");

    await saveTransactions(database, parsed.transactions);

    const transactions = await listTransactions(database);
    assert.equal(transactions.length, 2);
    assert.equal(transactions[0].type, "income");

    const deleted = await deleteLastTransaction(database);
    assert.equal(deleted.type, "income");
    assert.equal((await getSummary(database)).transactionCount, 1);
  });

  it("stores and clears pending chat actions", async () => {
    const database = await createTestDatabase();

    await setChatSessionPendingAction(database, 123, "reset_confirm");
    assert.equal((await getChatSession(database, 123)).pendingAction, "reset_confirm");

    await clearChatSessionPendingAction(database, 123);
    assert.equal((await getChatSession(database, 123)).pendingAction, null);
  });

  it("clears all transactions", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-12k alfamid\n-20k bensin\n+100k refund");

    await saveTransactions(database, parsed.transactions);
    const result = await clearAllTransactions(database);

    assert.equal(result.deletedCount, 3);
    assert.equal((await getSummary(database)).transactionCount, 0);
  });

  it("deletes a transaction by id", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-10k makan\n-20k bensin");
    const saved = await saveTransactions(database, parsed.transactions);

    const deleted = await deleteTransactionById(database, saved[0].id);
    const remaining = await listTransactions(database);

    assert.equal(deleted.id, saved[0].id);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].note, "bensin");
  });

  it("searches transactions by note and category", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-20k bensin\n-15k kopi kategori food");

    await saveTransactions(database, parsed.transactions);
    const byNote = await searchTransactions(database, "bensin");
    const byCategory = await searchTransactions(database, "food");

    assert.equal(byNote.length, 1);
    assert.equal(byNote[0].note, "bensin");
    assert.equal(byCategory.length, 1);
    assert.equal(byCategory[0].note, "kopi");
  });
});
