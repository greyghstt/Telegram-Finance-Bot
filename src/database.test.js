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
  getDeletedTransactionById,
  getSummary,
  initializeDatabase,
  listBillReminders,
  listBudgets,
  listCategoryAliases,
  listCustomCategories,
  listRecurringRules,
  listTransfers,
  listTransactions,
  getWalletBalances,
  saveCategoryAlias,
  saveBillReminder,
  openDatabase,
  saveRecurringRule,
  restoreTransactionById,
  saveBudget,
  saveCustomCategory,
  saveTransfer,
  saveTransaction,
  saveTransactions,
  saveWallet,
  searchTransactions,
  setChatSessionPendingAction,
  updateTransactionCategory,
  updateTransactionById,
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
      deletedTransactions: 0,
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
    assert.ok(deleted.deletedAt);
    assert.equal((await getSummary(database)).transactionCount, 1);
    assert.equal((await getDeletedTransactionById(database, deleted.id)).id, deleted.id);
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
    assert.ok(deleted.deletedAt);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].note, "bensin");
  });

  it("restores soft-deleted transactions", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-10k makan\n-20k bensin");
    const saved = await saveTransactions(database, parsed.transactions);

    await deleteTransactionById(database, saved[1].id);
    const restored = await restoreTransactionById(database, saved[1].id);
    const summary = await getSummary(database);

    assert.equal(restored.id, saved[1].id);
    assert.equal(restored.deletedAt, null);
    assert.equal(summary.transactionCount, 2);
  });

  it("updates a transaction by id", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-10k makan");
    const saved = await saveTransaction(database, parsed.transaction);
    const replacement = parseInput("+25k refund transport");

    const updated = await updateTransactionById(database, saved.id, replacement.transaction);

    assert.equal(updated.id, saved.id);
    assert.equal(updated.type, "income");
    assert.equal(updated.amount, 25000);
    assert.equal(updated.note, "refund transport");
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

  it("supports global weekly budgets", async () => {
    const database = await createTestDatabase();
    const parsed = parseInput("-90k makan\n-10k parkir");

    await saveTransactions(database, parsed.transactions);
    await saveBudget(database, {
      chatId: 123,
      category: "global",
      monthlyLimit: 120000,
      period: "weekly",
    });

    const progress = await getBudgetProgress(database, 123, { period: "weekly" });

    assert.equal(progress[0].category, "global");
    assert.equal(progress[0].spent, 100000);
    assert.equal(progress[0].percent, 83);
    assert.equal(progress[0].status, "warning");
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

  it("stores wallets and tracks balances with transfers", async () => {
    const database = await createTestDatabase();

    await saveWallet(database, { chatId: 123, name: "cash" });
    await saveWallet(database, { chatId: 123, name: "bca" });
    await saveTransaction(database, parseInput("+500k gaji dompet bca").transaction);
    await saveTransaction(database, parseInput("-50k makan dompet cash").transaction);
    await saveTransfer(database, { chatId: 123, fromWallet: "bca", toWallet: "cash", amount: 100000, note: "isi cash" });

    const wallets = await getWalletBalances(database, 123);

    assert.equal((await listTransfers(database, 123)).length, 1);
    assert.equal(wallets.find((item) => item.name === "bca").balance, 400000);
    assert.equal(wallets.find((item) => item.name === "cash").balance, 50000);
  });

  it("stores recurring rules and bill reminders", async () => {
    const database = await createTestDatabase();

    await saveRecurringRule(database, {
      chatId: 123,
      cadence: "monthly",
      templateMessage: "-500k kos kategori housing",
      nextRunAt: "2026-05-01T00:00:00.000Z",
    });
    await saveBillReminder(database, {
      chatId: 123,
      title: "wifi",
      amount: 250000,
      category: "bills",
      dueDay: 15,
    });

    assert.equal((await listRecurringRules(database, 123)).length, 1);
    assert.equal((await listBillReminders(database, 123)).length, 1);
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
