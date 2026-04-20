import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeDatabase, openDatabase } from "./database.js";
import { getPeriodRange, handleMessage } from "./message-handler.js";

async function createTestDatabase() {
  const database = openDatabase(":memory:");
  await initializeDatabase(database);
  return database;
}

describe("message handler", () => {
  it("saves transaction messages and returns a reply", async () => {
    const database = await createTestDatabase();
    const result = await handleMessage(database, "-20k bensin");

    assert.equal(result.ok, true);
    assert.equal(result.saved.length, 1);
    assert.equal(result.summary.balance, -20000);
    assert.match(result.reply, /1 transaksi berhasil dicatat/);
    assert.match(result.reply, /WIB/);
  });

  it("handles balance and history commands", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "+100k refund");
    await handleMessage(database, "-20k bensin");

    const balance = await handleMessage(database, "saldo");
    const history = await handleMessage(database, "riwayat");

    assert.equal(balance.summary.balance, 80000);
    assert.match(balance.reply, /Saldo saat ini/);
    assert.equal(history.transactions.length, 2);
    assert.match(history.reply, /Riwayat transaksi terakhir/);
    assert.match(history.reply, /WIB/);
  });

  it("handles period reports with Jakarta date ranges", async () => {
    const database = await createTestDatabase();
    const now = new Date("2026-04-16T10:00:00.000Z");

    await handleMessage(database, "-20k makan");

    const report = await handleMessage(database, "hari ini", { now });

    assert.equal(report.kind, "command");
    assert.equal(report.command, "today_report");
    assert.match(report.reply, /Ringkasan hari ini/);
  });

  it("shows timestamps in period reports that contain recent transactions", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-20k makan");

    const report = await handleMessage(database, "hari ini");

    assert.match(report.reply, /Transaksi terakhir/);
    assert.match(report.reply, /WIB/);
  });

  it("deletes the last transaction", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-10k makan");
    await handleMessage(database, "+50k cashback");

    const deleted = await handleMessage(database, "hapus terakhir");

    assert.equal(deleted.ok, true);
    assert.equal(deleted.deleted.type, "income");
    assert.equal(deleted.summary.balance, -10000);
    assert.match(deleted.reply, /WIB/);
  });

  it("deletes a transaction by id", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-10k makan");
    await handleMessage(database, "-20k bensin");

    const deleted = await handleMessage(database, "hapus 1");
    const history = await handleMessage(database, "riwayat");

    assert.equal(deleted.ok, true);
    assert.equal(deleted.deleted.id, 1);
    assert.match(deleted.reply, /Transaksi #1 dihapus/);
    assert.doesNotMatch(history.reply, /makan/);
    assert.match(history.reply, /bensin/);
  });

  it("searches transactions", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-10k makan");
    await handleMessage(database, "-20k bensin");

    const result = await handleMessage(database, "cari bensin");

    assert.equal(result.command, "search");
    assert.equal(result.transactions.length, 1);
    assert.match(result.reply, /bensin/);
    assert.doesNotMatch(result.reply, /makan/);
  });

  it("shows a category report", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-10k makan");
    await handleMessage(database, "-20k bensin");

    const result = await handleMessage(database, "kategori");

    assert.equal(result.command, "category_report");
    assert.match(result.reply, /Laporan kategori/);
    assert.match(result.reply, /food/);
    assert.match(result.reply, /transport/);
  });

  it("includes local timestamps in export csv", async () => {
    const database = await createTestDatabase();

    await handleMessage(database, "-10k makan");

    const exported = await handleMessage(database, "export csv");

    assert.match(exported.csv, /created_at_local/);
    assert.match(exported.csv, /WIB/);
    assert.match(exported.filename, /telegram-finance-bot-.*\.csv/);
  });

  it("returns reset instructions for reset command", async () => {
    const database = await createTestDatabase();

    const result = await handleMessage(database, "reset data");

    assert.equal(result.command, "reset_data");
    assert.match(result.reply, /butuh konfirmasi/i);
  });

  it("calculates Jakarta period boundaries", () => {
    const range = getPeriodRange("today", new Date("2026-04-16T10:00:00.000Z"));

    assert.equal(range.from, "2026-04-15T17:00:00.000Z");
    assert.equal(range.to, "2026-04-16T17:00:00.000Z");
  });
});
