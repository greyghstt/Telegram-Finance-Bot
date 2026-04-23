import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAmount, parseInput, parseTransactionLine } from "./parser.js";

describe("parseAmount", () => {
  it("supports rupiah notation and shorthand units", () => {
    assert.equal(parseAmount("20000"), 20000);
    assert.equal(parseAmount("20.000"), 20000);
    assert.equal(parseAmount("20,000"), 20000);
    assert.equal(parseAmount("20", "k"), 20000);
    assert.equal(parseAmount("20", "rb"), 20000);
    assert.equal(parseAmount("20", "r"), 20000);
    assert.equal(parseAmount("20", "rebu"), 20000);
    assert.equal(parseAmount("1,5", "jt"), 1500000);
    assert.equal(parseAmount("2.5", "juta"), 2500000);
    assert.equal(parseAmount("1.250.000"), 1250000);
    assert.equal(parseAmount("1.250.000,50"), 1250001);
  });
});

describe("parseTransactionLine", () => {
  it("parses basic expenses", () => {
    const result = parseTransactionLine("-20k bensin");

    assert.equal(result.ok, true);
    assert.equal(result.transaction.type, "expense");
    assert.equal(result.transaction.amount, 20000);
    assert.equal(result.transaction.note, "bensin");
    assert.equal(result.transaction.category, "transport");
  });

  it("parses income from plus sign", () => {
    const result = parseTransactionLine("+500k gaji");

    assert.equal(result.ok, true);
    assert.equal(result.transaction.type, "income");
    assert.equal(result.transaction.amount, 500000);
    assert.equal(result.transaction.note, "gaji");
    assert.equal(result.transaction.category, "income");
  });

  it("uses the leading sign as the transaction type", () => {
    const expense = parseTransactionLine("-bayar Rp35.000 makan");
    const income = parseTransactionLine("+masuk 1,5jt freelance");

    assert.equal(expense.transaction.type, "expense");
    assert.equal(expense.transaction.amount, 35000);
    assert.equal(expense.transaction.note, "makan");
    assert.equal(income.transaction.type, "income");
    assert.equal(income.transaction.amount, 1500000);
    assert.equal(income.transaction.note, "freelance");
  });

  it("parses amount after note and keeps metadata", () => {
    const result = parseTransactionLine("-makan ayam 27rb via qris kemarin #kantin");

    assert.equal(result.ok, true);
    assert.equal(result.transaction.type, "expense");
    assert.equal(result.transaction.amount, 27000);
    assert.equal(result.transaction.note, "makan ayam");
    assert.equal(result.transaction.category, "food");
    assert.equal(result.transaction.paymentMethod, "qris");
    assert.deepEqual(result.transaction.date, {
      kind: "relative",
      value: "yesterday",
      text: "kemarin",
    });
    assert.deepEqual(result.transaction.tags, ["kantin"]);
  });

  it("supports explicit category and date", () => {
    const result = parseTransactionLine("-Rp125.000 buku kategori education 16/04/2026");

    assert.equal(result.ok, true);
    assert.equal(result.transaction.amount, 125000);
    assert.equal(result.transaction.note, "buku");
    assert.equal(result.transaction.category, "education");
    assert.equal(result.transaction.date.value, "2026-04-16");
  });

  it("supports explicit wallet metadata", () => {
    const result = parseTransactionLine("-20k bensin dompet cash");

    assert.equal(result.ok, true);
    assert.equal(result.transaction.wallet, "cash");
  });

  it("supports negative sign for expense and large income", () => {
    const expense = parseTransactionLine("- 15k parkir");
    const income = parseTransactionLine("+ Rp2.500.000 gaji bca");

    assert.equal(expense.transaction.type, "expense");
    assert.equal(expense.transaction.amount, 15000);
    assert.equal(income.transaction.type, "income");
    assert.equal(income.transaction.amount, 2500000);
    assert.equal(income.transaction.paymentMethod, "bank_transfer");
  });

  it("asks for explicit type when direct input has no sign or mode", () => {
    const result = parseTransactionLine("20k bensin");

    assert.equal(result.ok, false);
    assert.match(result.error, /Tipe transaksi belum jelas/);
  });

  it("parses unsigned transactions when default type is explicit", () => {
    const expense = parseTransactionLine("20k bensin", { defaultType: "expense" });
    const income = parseTransactionLine("500k gaji", { defaultType: "income" });

    assert.equal(expense.ok, true);
    assert.equal(expense.transaction.type, "expense");
    assert.equal(expense.transaction.amount, 20000);
    assert.equal(income.ok, true);
    assert.equal(income.transaction.type, "income");
    assert.equal(income.transaction.amount, 500000);
  });
});

describe("parseInput", () => {
  it("parses commands", () => {
    assert.deepEqual(parseInput("saldo"), {
      ok: true,
      kind: "command",
      command: "balance",
      original: "saldo",
    });

    assert.equal(parseInput("hari ini").command, "today_report");
    assert.equal(parseInput("hapus terakhir").command, "delete_last");
    assert.equal(parseInput("undo").command, "undo_delete");
    assert.equal(parseInput("saldo dong?").command, "balance");
    assert.equal(parseInput("export csv").command, "export");
    assert.equal(parseInput("riwayat").command, "history");
    assert.equal(parseInput("kategori").command, "category_report");
    assert.equal(parseInput("/insight").command, "insight");
    assert.equal(parseInput("insight").command, "insight");
    assert.equal(parseInput("ai insight").command, "insight");
    assert.equal(parseInput("analisis").command, "insight");
    assert.equal(parseInput("analisa").command, "insight");
    assert.equal(parseInput("reset data").command, "reset_data");
  });

  it("parses multiline transactions as a batch", () => {
    const result = parseInput("1. -12k minimarket\n2. -20k bensin\n3. +100k refund");

    assert.equal(result.ok, true);
    assert.equal(result.kind, "batch");
    assert.equal(result.count, 3);
    assert.equal(result.totalExpense, 32000);
    assert.equal(result.totalIncome, 100000);
  });

  it("parses unsigned batch transactions with explicit default type", () => {
    const result = parseInput("1. 12k minimarket\n2. 20k bensin", {
      defaultType: "expense",
    });

    assert.equal(result.ok, true);
    assert.equal(result.kind, "batch");
    assert.equal(result.totalExpense, 32000);
  });

  it("returns clear errors for unknown messages", () => {
    const result = parseInput("halo apa kabar");

    assert.equal(result.ok, false);
    assert.equal(result.kind, "error");
  });
});
