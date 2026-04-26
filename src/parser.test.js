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
  it("requires explicit type context for transaction parsing", () => {
    const result = parseTransactionLine("20k bensin");

    assert.equal(result.ok, false);
    assert.match(result.error, /Tipe transaksi belum jelas/);
  });

  it("parses amount after note and keeps metadata when type context is explicit", () => {
    const result = parseTransactionLine("makan ayam 27rb via qris kemarin #kantin", { defaultType: "expense" });

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

  it("supports explicit category and date with explicit type context", () => {
    const result = parseTransactionLine("Rp125.000 buku kategori education 16/04/2026", { defaultType: "expense" });

    assert.equal(result.ok, true);
    assert.equal(result.transaction.amount, 125000);
    assert.equal(result.transaction.note, "buku");
    assert.equal(result.transaction.category, "education");
    assert.equal(result.transaction.date.value, "2026-04-16");
  });

  it("supports explicit wallet metadata with explicit type context", () => {
    const result = parseTransactionLine("20k bensin dompet cash", { defaultType: "expense" });

    assert.equal(result.ok, true);
    assert.equal(result.transaction.wallet, "cash");
  });

  it("does not infer clear natural expense intent without explicit type", () => {
    const result = parseTransactionLine("beli bensin 20 ribu pakai cash");

    assert.equal(result.ok, false);
    assert.match(result.error, /Tipe transaksi belum jelas/);
  });

  it("does not infer clear natural income intent without explicit type", () => {
    const result = parseTransactionLine("gaji freelance masuk 1,5 juta ke bca");

    assert.equal(result.ok, false);
    assert.match(result.error, /Tipe transaksi belum jelas/);
  });

  it("asks for explicit type when natural input is ambiguous", () => {
    const result = parseTransactionLine("20k bensin");

    assert.equal(result.ok, false);
    assert.match(result.error, /Tipe transaksi belum jelas/);
  });

  it("asks for explicit type when balance-style input is ambiguous", () => {
    const result = parseTransactionLine("saldo bank 70000");

    assert.equal(result.ok, false);
    assert.match(result.error, /Tipe transaksi belum jelas/);
  });

  it("asks for explicit type when transfer-style input is ambiguous", () => {
    const result = parseTransactionLine("bca ke cash 50 ribu");

    assert.equal(result.ok, false);
    assert.match(result.error, /Tipe transaksi belum jelas/);
  });

  it("asks for explicit type when delete request includes amount", () => {
    const result = parseTransactionLine("hapus transaksi bensin tadi 20 ribu");

    assert.equal(result.ok, false);
    assert.match(result.error, /Tipe transaksi belum jelas/);
  });

  it("does not treat plus or minus prefixes as transaction type", () => {
    const expense = parseTransactionLine("-20k bensin");
    const income = parseTransactionLine("+500k gaji");

    assert.equal(expense.ok, false);
    assert.match(expense.error, /Tipe transaksi belum jelas|Nominal belum ditemukan/);
    assert.equal(income.ok, false);
    assert.match(income.error, /Tipe transaksi belum jelas|Nominal belum ditemukan/);
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

  it("parses unsigned note-first transactions in input mode", () => {
    const expense = parseTransactionLine("beli bensin 20k dompet cash", { defaultType: "expense" });
    const income = parseTransactionLine("gaji freelance 1,5jt dompet bca", { defaultType: "income" });

    assert.equal(expense.ok, true);
    assert.equal(expense.transaction.type, "expense");
    assert.equal(expense.transaction.amount, 20000);
    assert.match(expense.transaction.note, /bensin/i);
    assert.equal(expense.transaction.wallet, "cash");

    assert.equal(income.ok, true);
    assert.equal(income.transaction.type, "income");
    assert.equal(income.transaction.amount, 1500000);
    assert.match(income.transaction.note, /gaji freelance/i);
    assert.equal(income.transaction.wallet, "bca");
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
    assert.equal(parseInput("batal").ok, false);
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
