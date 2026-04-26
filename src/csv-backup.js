import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { listTransactions, saveTransactions } from "./database.js";

const CSV_HEADER = [
  "id",
  "type",
  "amount",
  "note",
  "category",
  "payment_method",
  "created_at_local",
  "created_at",
].join(",");

export async function exportTransactionsToCsv(database, options = {}) {
  const transactions = await listTransactions(database, { limit: options.limit ?? 1000, chatId: options.chatId ?? null });
  const rows = transactions.map((transaction) =>
    [
      transaction.id,
      transaction.type,
      transaction.amount,
      csvCell(transaction.note),
      transaction.category,
      transaction.paymentMethod ?? "",
      csvCell(formatTransactionTimestamp(transaction.createdAt)),
      transaction.createdAt,
    ].join(","),
  );

  return {
    count: transactions.length,
    csv: [CSV_HEADER, ...rows].join("\n"),
  };
}

export function writeCsvBackupFile(content, targetPath) {
  const filePath = resolve(targetPath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

export function readCsvBackupFile(filePath) {
  return readFileSync(resolve(filePath), "utf8");
}

export function parseTransactionsCsv(content) {
  const rows = parseCsvRows(content);
  if (rows.length === 0) {
    return { ok: false, error: "CSV kosong." };
  }

  const header = rows[0];
  const required = ["type", "amount", "note", "category", "payment_method", "created_at"];
  const missing = required.filter((key) => !header.includes(key));

  if (missing.length > 0) {
    return { ok: false, error: `Header CSV kurang: ${missing.join(", ")}` };
  }

  const transactions = [];
  for (const row of rows.slice(1)) {
    if (row.every((value) => !String(value ?? "").trim())) {
      continue;
    }

    const values = Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""]));
    const amount = Number.parseInt(values.amount, 10);
    const type = String(values.type ?? "").trim();
    const note = String(values.note ?? "").trim();
    const category = String(values.category ?? "other").trim();
    const createdAt = String(values.created_at ?? "").trim();

    if (!["income", "expense"].includes(type) || !Number.isSafeInteger(amount) || amount <= 0 || !note || !createdAt) {
      return { ok: false, error: `Baris CSV tidak valid untuk note: ${note || "(kosong)"}` };
    }

    transactions.push({
      type,
      amount,
      note,
      category,
      paymentMethod: String(values.payment_method ?? "").trim() || null,
      rawAmount: String(values.amount ?? "").trim(),
      original: `${amount} ${note}`,
      confidence: 1,
      createdAt,
      date: null,
      tags: [],
    });
  }

  return { ok: true, transactions };
}

export async function importTransactionsFromCsv(database, content, { dryRun = false, chatId = null } = {}) {
  const parsed = parseTransactionsCsv(content);
  if (!parsed.ok) {
    return parsed;
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      count: parsed.transactions.length,
      transactions: parsed.transactions,
    };
  }

  const saved = await saveTransactions(
    database,
    parsed.transactions.map((transaction) => ({ ...transaction, chatId })),
  );
  return {
    ok: true,
    dryRun: false,
    count: saved.length,
    saved,
  };
}

function parseCsvRows(content) {
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }

    currentField += char;
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function formatTransactionTimestamp(value) {
  if (!value) {
    return "tanggal tidak tersedia";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date) + " WIB";
}
