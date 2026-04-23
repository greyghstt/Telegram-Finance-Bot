import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getChatSession,
  initializeDatabase,
  listTransactions,
  openDatabase,
  setChatSessionPendingAction,
} from "./database.js";
import {
  BOT_COMMANDS,
  normalizeTelegramCommand,
  processTelegramUpdate,
} from "./telegram-service.js";

const originalFetch = globalThis.fetch;

async function createTestDatabase() {
  const database = openDatabase(":memory:");
  await initializeDatabase(database);
  return database;
}

function mockTelegramFetch(replies) {
  globalThis.fetch = async (_url, options) => {
    replies.push(options);

    return Response.json({
      ok: true,
      result: { message_id: replies.length },
    });
  };
}

function readJsonBody(options) {
  return JSON.parse(options.body);
}

function textUpdate(text, chatId = 123456789) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: chatId },
      text,
    },
  };
}

describe("telegram service", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("exposes the insight command in Telegram command metadata", () => {
    assert.equal(normalizeTelegramCommand("/insight"), "insight");
    assert.equal(normalizeTelegramCommand("/tanya bulan ini aman?"), "tanya bulan ini aman?");
    assert.equal(normalizeTelegramCommand("/budget"), "budget");
    assert.equal(BOT_COMMANDS.some((command) => command.command === "insight"), true);
    assert.equal(BOT_COMMANDS.some((command) => command.command === "tanya"), true);
    assert.equal(BOT_COMMANDS.some((command) => command.command === "budget"), true);
  });

  it("stores input mode in the database and applies it to the next message", async () => {
    const database = await createTestDatabase();
    const replies = [];
    const allowedChatIds = new Set(["123456789"]);
    mockTelegramFetch(replies);

    await processTelegramUpdate({
      database,
      update: textUpdate("/pengeluaran"),
      token: "test-token",
      allowedChatIds,
    });

    assert.equal((await getChatSession(database, 123456789)).pendingInputMode, "expense");

    await processTelegramUpdate({
      database,
      update: textUpdate("20k bensin"),
      token: "test-token",
      allowedChatIds,
    });

    assert.equal((await getChatSession(database, 123456789)).pendingInputMode, null);
    assert.match(readJsonBody(replies.at(-1)).text, /Tersimpan: 1 transaksi/);
  });

  it("requires explicit confirmation before resetting budgets", async () => {
    const database = await createTestDatabase();
    const replies = [];
    mockTelegramFetch(replies);
    const allowedChatIds = new Set(["123456789"]);

    await processTelegramUpdate({
      database,
      update: textUpdate("budget food 700k"),
      token: "test-token",
      allowedChatIds,
    });

    await processTelegramUpdate({
      database,
      update: textUpdate("reset budget"),
      token: "test-token",
      allowedChatIds,
    });

    assert.equal((await getChatSession(database, 123456789)).pendingAction, "budget_reset_confirm");

    await processTelegramUpdate({
      database,
      update: textUpdate("YA RESET BUDGET"),
      token: "test-token",
      allowedChatIds,
    });

    assert.equal((await getChatSession(database, 123456789)).pendingAction, null);
    assert.match(readJsonBody(replies.at(-1)).text, /budget berhasil direset/i);
  });

  it("blocks chats outside the allowed list", async () => {
    const database = await createTestDatabase();
    const replies = [];
    mockTelegramFetch(replies);

    const result = await processTelegramUpdate({
      database,
      update: textUpdate("saldo", 999),
      token: "test-token",
      allowedChatIds: new Set(["123456789"]),
    });

    assert.equal(result.kind, "blocked");
    assert.match(readJsonBody(replies.at(-1)).text, /hanya untuk pemilik/);
  });

  it("sends export as Telegram document", async () => {
    const database = await createTestDatabase();
    const replies = [];
    mockTelegramFetch(replies);
    const allowedChatIds = new Set(["123456789"]);

    await processTelegramUpdate({
      database,
      update: textUpdate("-20k bensin"),
      token: "test-token",
      allowedChatIds,
    });

    await processTelegramUpdate({
      database,
      update: textUpdate("export csv"),
      token: "test-token",
      allowedChatIds,
    });

    const documentRequest = replies.at(-1);
    assert.equal(documentRequest.body instanceof FormData, true);
  });

  it("requires explicit confirmation before resetting all transactions", async () => {
    const database = await createTestDatabase();
    const replies = [];
    mockTelegramFetch(replies);
    const allowedChatIds = new Set(["123456789"]);

    await processTelegramUpdate({
      database,
      update: textUpdate("-20k bensin"),
      token: "test-token",
      allowedChatIds,
    });

    await processTelegramUpdate({
      database,
      update: textUpdate("/reset"),
      token: "test-token",
      allowedChatIds,
    });

    assert.equal((await getChatSession(database, 123456789)).pendingAction, "reset_confirm");

    await processTelegramUpdate({
      database,
      update: textUpdate("YA RESET"),
      token: "test-token",
      allowedChatIds,
    });

    assert.equal((await listTransactions(database)).length, 0);
    assert.equal((await getChatSession(database, 123456789)).pendingAction, null);
    assert.match(readJsonBody(replies.at(-1)).text, /berhasil direset/i);
  });

  it("saves pending ambiguous AI transactions after type clarification", async () => {
    const database = await createTestDatabase();
    const replies = [];
    mockTelegramFetch(replies);
    const allowedChatIds = new Set(["123456789"]);

    await setChatSessionPendingAction(database, 123456789, "transaction_clarify", {
      candidates: [
        {
          amount: 50000,
          note: "refund teman",
          category: "other",
          confidence: 0.9,
          original: "refund teman 50 ribu",
        },
      ],
    });

    const result = await processTelegramUpdate({
      database,
      update: textUpdate("pengeluaran"),
      token: "test-token",
      allowedChatIds,
    });

    const transactions = await listTransactions(database);
    const session = await getChatSession(database, 123456789);

    assert.equal(result.kind, "transaction_clarification");
    assert.equal(result.result.ok, true);
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].type, "expense");
    assert.equal(transactions[0].amount, 50000);
    assert.equal(session.pendingAction, null);
    assert.match(readJsonBody(replies.at(-1)).text, /Klarifikasi dipakai: pengeluaran/);
  });
});
