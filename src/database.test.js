import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearAllTransactions,
  clearBudgets,
  clearChatSessionPendingAction,
  deleteLastTransaction,
  deleteTransactionById,
  deleteBudget,
  getBudgetProgress,
  getDatabaseStatus,
  getChatSession,
  getSummary,
  initializeDatabase,
  listBudgets,
  listCategoryAliases,
  listCustomCategories,
  listTransactions,
  saveCategoryAlias,
  openDatabase,
  saveBudget,
  saveCustomCategory,
  saveTransaction,
  saveTransactions,
  searchTransactions,
  setChatSessionPendingAction,
  updateTransactionCategory,
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
      budgets: 0,
      customCategories: 0,
      categoryAliases: 0,
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
    const parsed = parseInput("-12k minimarket\n-20k bensin\n+100k refund");
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

    await setChatSessionPendingAction(database, 123, "budget_reset_confirm", { confirm: true });
    assert.equal((await getChatSession(database, 123)).pendingAction, "budget_reset_confirm");
    assert.deepEqual((await getChatSession(database, 123)).pendingPayload, { confirm: true });

    await clearChatSessionPendingAction(database, 123);
    assert.equal((await getChatSession(database, 123)).pendingAction, null);
    assert.equal((await getChatSession(database, 123)).pendingPayload, null);
  });

  it("clears all transactions", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-12k minimarket\n-20k bensin\n+100k refund");

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

  it("stores budgets and calculates monthly progress", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-450k makan kategori food\n-50k bensin kategori transport");

    await saveTransactions(database, parsed.transactions);
    const food = await saveBudget(database, {
      chatId: 123,
      category: "food",
      monthlyLimit: 700000,
    });
    await saveBudget(database, {
      chatId: 123,
      category: "transport",
      monthlyLimit: 300000,
    });

    assert.equal(food.category, "food");
    assert.equal((await listBudgets(database, 123)).length, 2);

    const progress = await getBudgetProgress(database, 123);
    const foodProgress = progress.find((item) => item.category === "food");

    assert.equal(foodProgress.spent, 450000);
    assert.equal(foodProgress.monthlyLimit, 700000);
    assert.equal(foodProgress.percent, 64);
    assert.equal(foodProgress.status, "ok");
  });

  it("deletes and clears budgets", async () => {
    const database = await createTestDatabase();

    await saveBudget(database, { chatId: 123, category: "food", monthlyLimit: 700000 });
    await saveBudget(database, { chatId: 123, category: "transport", monthlyLimit: 300000 });

    const deleted = await deleteBudget(database, 123, "food");
    assert.equal(deleted.category, "food");
    assert.equal((await listBudgets(database, 123)).length, 1);

    const cleared = await clearBudgets(database, 123);
    assert.equal(cleared.deletedCount, 1);
    assert.equal((await listBudgets(database, 123)).length, 0);
  });

  it("stores custom categories and aliases", async () => {
    const database = await createTestDatabase();

    const category = await saveCustomCategory(database, {
      chatId: 123,
      category: "kopi",
      label: "Kopi",
    });
    const alias = await saveCategoryAlias(database, {
      chatId: 123,
      alias: "ngopi sore",
      category: "kopi",
    });

    assert.equal(category.category, "kopi");
    assert.equal(category.label, "Kopi");
    assert.equal(alias.alias, "ngopi sore");
    assert.equal(alias.category, "kopi");
    assert.equal((await listCustomCategories(database, 123)).length, 1);
    assert.equal((await listCategoryAliases(database, 123)).length, 1);
  });

  it("updates a transaction category", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-20k kopi kategori other");
    const saved = await saveTransaction(database, parsed.transaction);

    const updated = await updateTransactionCategory(database, saved.id, "kopi");

    assert.equal(updated.id, saved.id);
    assert.equal(updated.category, "kopi");
    assert.equal((await listTransactions(database))[0].category, "kopi");
  });
});
