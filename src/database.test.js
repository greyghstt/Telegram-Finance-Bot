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
  saveWalletBalanceEntry,
  saveWallet,
  searchTransactions,
  setDefaultWallet,
  setChatSessionPendingAction,
  listWalletBalanceEntries,
  updateTransactionCategory,
  updateTransactionById,
  shouldInitializeDatabaseAtRuntime,
} from "./database.js";

async function createTestDatabase() {
  const database = openDatabase(":memory:");
  await initializeDatabase(database);
  return database;
}

function transaction({ type = "expense", amount, note, category = "other", wallet = null, chatId = null }) {
  return {
    type,
    amount,
    note,
    category,
    wallet,
    chatId,
    paymentMethod: null,
    date: null,
    tags: [],
    rawAmount: String(amount),
    original: `${note} ${amount}`,
    confidence: 0.9,
  };
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

  it("initializes runtime schema when DATABASE_URL is present", () => {
    const original = {
      DATABASE_URL: process.env.DATABASE_URL,
      RUNTIME_DB_INIT: process.env.RUNTIME_DB_INIT,
      VERCEL: process.env.VERCEL,
    };

    process.env.DATABASE_URL = "postgres://example";
    process.env.VERCEL = "1";
    delete process.env.RUNTIME_DB_INIT;

    assert.equal(shouldInitializeDatabaseAtRuntime(), true);

    process.env.DATABASE_URL = original.DATABASE_URL;
    process.env.RUNTIME_DB_INIT = original.RUNTIME_DB_INIT;
    process.env.VERCEL = original.VERCEL;
  });

  it("saves a parsed transaction", async () => {
    const database = await createTestDatabase();
    const saved = await saveTransaction(database, transaction({ amount: 20000, note: "bensin", category: "transport" }));

    assert.equal(saved.id, 1);
    assert.equal(saved.type, "expense");
    assert.equal(saved.amount, 20000);
    assert.equal(saved.note, "bensin");
    assert.equal(saved.category, "transport");
  });

  it("saves batch transactions and calculates summary", async () => {
    const database = await createTestDatabase();
    const saved = await saveTransactions(database, [
      transaction({ amount: 12000, note: "minimarket", category: "groceries" }),
      transaction({ amount: 20000, note: "bensin", category: "transport" }),
      transaction({ type: "income", amount: 100000, note: "refund", category: "income" }),
    ]);
    const summary = await getSummary(database);

    assert.equal(saved.length, 3);
    assert.equal(summary.totalExpense, 32000);
    assert.equal(summary.totalIncome, 100000);
    assert.equal(summary.balance, 68000);
    assert.equal(summary.transactionCount, 3);
  });

  it("lists and deletes last transaction", async () => {
    const database = await createTestDatabase();
    await saveTransactions(database, [
      transaction({ amount: 10000, note: "makan", category: "food" }),
      transaction({ type: "income", amount: 50000, note: "cashback", category: "income" }),
    ]);

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
    await saveTransactions(database, [
      transaction({ amount: 12000, note: "minimarket", category: "groceries" }),
      transaction({ amount: 20000, note: "bensin", category: "transport" }),
      transaction({ type: "income", amount: 100000, note: "refund", category: "income" }),
    ]);
    const result = await clearAllTransactions(database);

    assert.equal(result.deletedCount, 3);
    assert.equal((await getSummary(database)).transactionCount, 0);
  });

  it("deletes a transaction by id", async () => {
    const database = await createTestDatabase();
    const saved = await saveTransactions(database, [
      transaction({ amount: 10000, note: "makan", category: "food" }),
      transaction({ amount: 20000, note: "bensin", category: "transport" }),
    ]);

    const deleted = await deleteTransactionById(database, saved[0].id);
    const remaining = await listTransactions(database);

    assert.equal(deleted.id, saved[0].id);
    assert.ok(deleted.deletedAt);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].note, "bensin");
  });

  it("restores soft-deleted transactions", async () => {
    const database = await createTestDatabase();
    const saved = await saveTransactions(database, [
      transaction({ amount: 10000, note: "makan", category: "food" }),
      transaction({ amount: 20000, note: "bensin", category: "transport" }),
    ]);

    await deleteTransactionById(database, saved[1].id);
    const restored = await restoreTransactionById(database, saved[1].id);
    const summary = await getSummary(database);

    assert.equal(restored.id, saved[1].id);
    assert.equal(restored.deletedAt, null);
    assert.equal(summary.transactionCount, 2);
  });

  it("updates a transaction by id", async () => {
    const database = await createTestDatabase();
    const saved = await saveTransaction(database, transaction({ amount: 10000, note: "makan", category: "food" }));
    const replacement = transaction({ type: "income", amount: 25000, note: "refund transport", category: "income" });

    const updated = await updateTransactionById(database, saved.id, replacement);

    assert.equal(updated.id, saved.id);
    assert.equal(updated.type, "income");
    assert.equal(updated.amount, 25000);
    assert.equal(updated.note, "refund transport");
  });

  it("searches transactions by note and category", async () => {
    const database = await createTestDatabase();
    await saveTransactions(database, [
      transaction({ amount: 20000, note: "bensin", category: "transport" }),
      transaction({ amount: 15000, note: "kopi", category: "food" }),
    ]);
    const byNote = await searchTransactions(database, "bensin");
    const byCategory = await searchTransactions(database, "food");

    assert.equal(byNote.length, 1);
    assert.equal(byNote[0].note, "bensin");
    assert.equal(byCategory.length, 1);
    assert.equal(byCategory[0].note, "kopi");
  });

  it("stores budgets and calculates monthly progress", async () => {
    const database = await createTestDatabase();
    await saveTransactions(database, [
      transaction({ amount: 450000, note: "makan", category: "food", chatId: 123 }),
      transaction({ amount: 50000, note: "bensin", category: "transport", chatId: 123 }),
    ]);
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
    await saveTransactions(database, [
      transaction({ amount: 90000, note: "makan", category: "food", chatId: 123 }),
      transaction({ amount: 10000, note: "parkir", category: "transport", chatId: 123 }),
    ]);
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
    await saveTransaction(database, transaction({ type: "income", amount: 500000, note: "gaji", category: "income", wallet: "bca", chatId: 123 }));
    await saveTransaction(database, transaction({ amount: 50000, note: "makan", category: "food", wallet: "cash", chatId: 123 }));
    await saveTransfer(database, { chatId: 123, fromWallet: "bca", toWallet: "cash", amount: 100000, note: "isi cash" });

    const wallets = await getWalletBalances(database, 123);

    assert.equal((await listTransfers(database, 123)).length, 1);
    assert.equal(wallets.find((item) => item.name === "bca").balance, 400000);
    assert.equal(wallets.find((item) => item.name === "cash").balance, 50000);
  });

  it("stores wallet balance entries and default wallet", async () => {
    const database = await createTestDatabase();

    await saveWallet(database, { chatId: 123, name: "bank" });
    await setDefaultWallet(database, 123, "bank");
    await saveWalletBalanceEntry(database, { chatId: 123, wallet: "bank", action: "set", amount: 70000 });
    await saveWalletBalanceEntry(database, { chatId: 123, wallet: "bank", action: "adjust", amount: 5000 });

    const entries = await listWalletBalanceEntries(database, 123, { wallet: "bank" });
    const session = await getChatSession(database, 123);
    const wallets = await getWalletBalances(database, 123);

    assert.equal(session.defaultWallet, "bank");
    assert.equal(entries.length, 2);
    assert.equal(entries[0].action, "adjust");
    assert.equal(wallets.find((item) => item.name === "bank").balance, 75000);
  });

  it("stores recurring rules and bill reminders", async () => {
    const database = await createTestDatabase();

    await saveRecurringRule(database, {
      chatId: 123,
      cadence: "monthly",
      templateMessage: "kos 500k kategori housing",
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
    const saved = await saveTransaction(database, transaction({ amount: 20000, note: "kopi", category: "other" }));

    const updated = await updateTransactionCategory(database, saved.id, "kopi");

    assert.equal(updated.id, saved.id);
    assert.equal(updated.category, "kopi");
    assert.equal((await listTransactions(database))[0].category, "kopi");
  });

  it("scopes transaction mutations by chat id", async () => {
    const database = await createTestDatabase();
    const chatOne = 111;
    const chatTwo = 222;
    const [owned, other] = await saveTransactions(database, [
      transaction({ amount: 10000, note: "makan", category: "food", chatId: chatOne }),
      transaction({ amount: 20000, note: "bensin", category: "transport", chatId: chatTwo }),
    ]);

    assert.equal(await deleteTransactionById(database, other.id, chatOne), null);
    assert.equal((await listTransactions(database, { chatId: chatTwo })).length, 1);

    const deleted = await deleteTransactionById(database, owned.id, chatOne);
    assert.equal(deleted.id, owned.id);
    assert.equal((await listTransactions(database, { chatId: chatOne })).length, 0);
    assert.equal((await listTransactions(database, { chatId: chatTwo })).length, 1);

    assert.equal(await restoreTransactionById(database, owned.id, chatTwo), null);
    const restored = await restoreTransactionById(database, owned.id, chatOne);
    assert.equal(restored.id, owned.id);

    const replacement = transaction({ type: "income", amount: 30000, note: "refund", category: "income", chatId: chatOne });
    assert.equal(await updateTransactionById(database, other.id, replacement, chatOne), null);
    const updated = await updateTransactionById(database, owned.id, replacement, chatOne);
    assert.equal(updated.amount, 30000);

    assert.equal(await updateTransactionCategory(database, other.id, "food", chatOne), null);
    assert.equal((await updateTransactionCategory(database, owned.id, "food", chatOne)).category, "food");
  });

  it("scopes delete last and reset by chat id", async () => {
    const database = await createTestDatabase();
    const chatOne = 111;
    const chatTwo = 222;
    await saveTransactions(database, [
      transaction({ amount: 10000, note: "makan", category: "food", chatId: chatOne }),
      transaction({ amount: 20000, note: "bensin", category: "transport", chatId: chatTwo }),
      transaction({ amount: 30000, note: "kopi", category: "food", chatId: chatOne }),
    ]);

    const deleted = await deleteLastTransaction(database, chatOne);
    assert.equal(deleted.note, "kopi");
    assert.equal((await listTransactions(database, { chatId: chatOne })).length, 1);
    assert.equal((await listTransactions(database, { chatId: chatTwo })).length, 1);

    const result = await clearAllTransactions(database, chatOne);
    assert.equal(result.deletedCount, 1);
    assert.equal((await listTransactions(database, { chatId: chatOne })).length, 0);
    assert.equal((await listTransactions(database, { chatId: chatTwo })).length, 1);
  });

  it("calculates budget progress within chat scope", async () => {
    const database = await createTestDatabase();
    await saveTransactions(database, [
      transaction({ amount: 10000, note: "makan", category: "food", chatId: 111 }),
      transaction({ amount: 90000, note: "makan besar", category: "food", chatId: 222 }),
    ]);
    await saveBudget(database, { chatId: 111, category: "food", monthlyLimit: 100000 });

    const progress = await getBudgetProgress(database, 111);

    assert.equal(progress[0].spent, 10000);
    assert.equal(progress[0].percent, 10);
  });
});
