import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

const DEFAULT_DB_PATH = resolve("data", "keuangan-telegram.sqlite");

export function openDatabase(filePath = process.env.DATABASE_PATH ?? DEFAULT_DB_PATH) {
  if (process.env.DATABASE_URL && filePath !== ":memory:") {
    return openPostgresDatabase(process.env.DATABASE_URL);
  }

  return openSqliteDatabase(filePath);
}

export function shouldInitializeDatabaseAtRuntime() {
  if (process.env.RUNTIME_DB_INIT === "1") {
    return true;
  }

  return !(process.env.VERCEL && process.env.DATABASE_URL);
}

export function openSqliteDatabase(filePath = DEFAULT_DB_PATH) {
  if (filePath !== ":memory:") {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const client = new DatabaseSync(filePath);
  client.exec("PRAGMA foreign_keys = ON;");
  client.exec("PRAGMA journal_mode = WAL;");

  return {
    kind: "sqlite",
    client,
    close: () => client.close(),
  };
}

export function openPostgresDatabase(databaseUrl) {
  return {
    kind: "postgres",
    client: postgres(databaseUrl, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: "require",
      prepare: false,
    }),
    close() {
      return this.client.end({ timeout: 5 });
    },
  };
}

export async function initializeDatabase(database) {
  if (database.kind === "postgres") {
    await database.client`
      create table if not exists public.transactions (
        id bigint generated always as identity primary key,
        type text not null check (type in ('income', 'expense')),
        amount integer not null check (amount > 0),
        note text not null,
        category text not null default 'other',
        payment_method text,
        date_kind text,
        date_value text,
        tags_json jsonb not null default '[]'::jsonb,
        raw_amount text,
        original text not null,
        confidence real not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await database.client`create index if not exists idx_transactions_created_at on public.transactions (created_at desc)`;
    await database.client`create index if not exists idx_transactions_type_created_at on public.transactions (type, created_at desc)`;
    await database.client`create index if not exists idx_transactions_category_created_at on public.transactions (category, created_at desc)`;
    await database.client`
      create table if not exists public.chat_sessions (
        id bigint generated always as identity primary key,
        chat_id text not null unique,
        pending_input_mode text check (pending_input_mode in ('income', 'expense')),
        pending_action text check (pending_action in ('reset_confirm')),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await database.client`create index if not exists idx_chat_sessions_chat_id on public.chat_sessions (chat_id)`;
    await database.client`
      alter table public.chat_sessions
      add column if not exists pending_action text check (pending_action in ('reset_confirm'))
    `;
    await database.client`alter table public.transactions enable row level security`;
    await database.client`alter table public.chat_sessions enable row level security`;
    return;
  }

  database.client.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      note TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      payment_method TEXT,
      date_kind TEXT,
      date_value TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      raw_amount TEXT,
      original TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_created_at
      ON transactions (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_type_created_at
      ON transactions (type, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_category_created_at
      ON transactions (category, created_at DESC);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL UNIQUE,
      pending_input_mode TEXT CHECK (pending_input_mode IN ('income', 'expense')),
      pending_action TEXT CHECK (pending_action IN ('reset_confirm')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_chat_id
      ON chat_sessions (chat_id);
  `);

  database.client
    .prepare(
      `INSERT OR IGNORE INTO schema_migrations (version, name)
       VALUES (1, 'create_transactions')`,
    )
    .run();

  try {
    database.client.exec(`
      ALTER TABLE chat_sessions
      ADD COLUMN pending_action TEXT CHECK (pending_action IN ('reset_confirm'));
    `);
  } catch (error) {
    if (!String(error.message).includes("duplicate column name")) {
      throw error;
    }
  }
}

export async function saveTransaction(database, transaction) {
  const now = transaction.createdAt ?? new Date().toISOString();

  if (database.kind === "postgres") {
    const rows = await database.client`
      insert into public.transactions (
        type,
        amount,
        note,
        category,
        payment_method,
        date_kind,
        date_value,
        tags_json,
        raw_amount,
        original,
        confidence,
        created_at,
        updated_at
      ) values (
        ${transaction.type},
        ${transaction.amount},
        ${transaction.note},
        ${transaction.category ?? "other"},
        ${transaction.paymentMethod ?? null},
        ${transaction.date?.kind ?? null},
        ${transaction.date?.value ?? null},
        ${database.client.json(transaction.tags ?? [])},
        ${transaction.rawAmount ?? null},
        ${transaction.original},
        ${transaction.confidence ?? 0},
        ${now},
        ${transaction.updatedAt ?? now}
      )
      returning *
    `;
    return mapTransactionRow(rows[0]);
  }

  const result = database.client
    .prepare(
      `INSERT INTO transactions (
        type,
        amount,
        note,
        category,
        payment_method,
        date_kind,
        date_value,
        tags_json,
        raw_amount,
        original,
        confidence,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      transaction.type,
      transaction.amount,
      transaction.note,
      transaction.category ?? "other",
      transaction.paymentMethod ?? null,
      transaction.date?.kind ?? null,
      transaction.date?.value ?? null,
      JSON.stringify(transaction.tags ?? []),
      transaction.rawAmount ?? null,
      transaction.original,
      transaction.confidence ?? 0,
      now,
      transaction.updatedAt ?? now,
    );

  return getTransactionById(database, Number(result.lastInsertRowid));
}

export async function saveTransactions(database, transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  if (database.kind === "postgres") {
    return database.client.begin((sql) =>
      Promise.all(transactions.map((transaction) => saveTransaction({ ...database, client: sql }, transaction))),
    );
  }

  database.client.exec("BEGIN;");

  try {
    const saved = [];
    for (const transaction of transactions) {
      saved.push(await saveTransaction(database, transaction));
    }
    database.client.exec("COMMIT;");
    return saved;
  } catch (error) {
    database.client.exec("ROLLBACK;");
    throw error;
  }
}

export async function getTransactionById(database, id) {
  if (database.kind === "postgres") {
    const rows = await database.client`select * from public.transactions where id = ${id}`;
    return rows[0] ? mapTransactionRow(rows[0]) : null;
  }

  const row = database.client.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
  return row ? mapTransactionRow(row) : null;
}

export async function listTransactions(database, { limit = 20, offset = 0, from, to } = {}) {
  const safeLimit = clampInteger(limit, 1, 100);
  const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);

  if (database.kind === "postgres") {
    return listPostgresTransactions(database, { limit: safeLimit, offset: safeOffset, from, to });
  }

  const period = buildSqlitePeriodFilter({ from, to });
  return database.client
    .prepare(
      `SELECT *
       FROM transactions
       ${period.where}
       ORDER BY id DESC
       LIMIT ?
       OFFSET ?`,
    )
    .all(...period.params, safeLimit, safeOffset)
    .map(mapTransactionRow);
}

export async function searchTransactions(database, query, { limit = 10 } = {}) {
  const safeLimit = clampInteger(limit, 1, 20);
  const keyword = String(query ?? "").trim();

  if (!keyword) {
    return [];
  }

  if (database.kind === "postgres") {
    const pattern = `%${keyword}%`;
    const rows = await database.client`
      select *
      from public.transactions
      where
        note ilike ${pattern}
        or category ilike ${pattern}
        or coalesce(payment_method, '') ilike ${pattern}
        or original ilike ${pattern}
        or tags_json::text ilike ${pattern}
      order by id desc
      limit ${safeLimit}
    `;
    return rows.map(mapTransactionRow);
  }

  const pattern = `%${keyword.toLowerCase()}%`;
  return database.client
    .prepare(
      `SELECT *
       FROM transactions
       WHERE
        lower(note) LIKE ?
        OR lower(category) LIKE ?
        OR lower(coalesce(payment_method, '')) LIKE ?
        OR lower(original) LIKE ?
        OR lower(tags_json) LIKE ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(pattern, pattern, pattern, pattern, pattern, safeLimit)
    .map(mapTransactionRow);
}

export async function getSummary(database, { from, to } = {}) {
  if (database.kind === "postgres") {
    const where = buildPostgresPeriodWhere(database.client, { from, to });
    const rows = await database.client`
      select
        coalesce(sum(case when type = 'income' then amount else 0 end), 0)::int as total_income,
        coalesce(sum(case when type = 'expense' then amount else 0 end), 0)::int as total_expense,
        count(*)::int as transaction_count
      from public.transactions
      ${where}
    `;
    return mapSummaryRow(rows[0]);
  }

  const period = buildSqlitePeriodFilter({ from, to });
  const row = database.client
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
        COUNT(*) AS transaction_count
       FROM transactions
       ${period.where}`,
    )
    .get(...period.params);

  return mapSummaryRow(row);
}

export async function getCategorySummary(database, { from, to, limit = 8 } = {}) {
  const safeLimit = clampInteger(limit, 1, 20);

  if (database.kind === "postgres") {
    const where = buildPostgresPeriodWhere(database.client, { from, to });
    const rows = await database.client`
      select
        category,
        coalesce(sum(case when type = 'income' then amount else 0 end), 0)::int as total_income,
        coalesce(sum(case when type = 'expense' then amount else 0 end), 0)::int as total_expense,
        count(*)::int as transaction_count
      from public.transactions
      ${where}
      group by category
      order by total_expense desc, total_income desc
      limit ${safeLimit}
    `;
    return rows.map(mapCategorySummaryRow);
  }

  const period = buildSqlitePeriodFilter({ from, to });
  return database.client
    .prepare(
      `SELECT
        category,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
        COUNT(*) AS transaction_count
       FROM transactions
       ${period.where}
       GROUP BY category
       ORDER BY total_expense DESC, total_income DESC
       LIMIT ?`,
    )
    .all(...period.params, safeLimit)
    .map(mapCategorySummaryRow);
}

export async function deleteLastTransaction(database) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      delete from public.transactions
      where id = (select id from public.transactions order by id desc limit 1)
      returning *
    `;
    return rows[0] ? mapTransactionRow(rows[0]) : null;
  }

  const row = database.client
    .prepare("SELECT * FROM transactions ORDER BY id DESC LIMIT 1")
    .get();

  if (!row) {
    return null;
  }

  database.client.prepare("DELETE FROM transactions WHERE id = ?").run(row.id);
  return mapTransactionRow(row);
}

export async function deleteTransactionById(database, id) {
  const transactionId = Number.parseInt(id, 10);

  if (!Number.isSafeInteger(transactionId) || transactionId <= 0) {
    return null;
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      delete from public.transactions
      where id = ${transactionId}
      returning *
    `;
    return rows[0] ? mapTransactionRow(rows[0]) : null;
  }

  const row = database.client
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(transactionId);

  if (!row) {
    return null;
  }

  database.client.prepare("DELETE FROM transactions WHERE id = ?").run(transactionId);
  return mapTransactionRow(row);
}

export async function clearAllTransactions(database) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      delete from public.transactions
      returning id
    `;
    return {
      deletedCount: rows.length,
    };
  }

  const row = database.client.prepare("SELECT COUNT(*) AS count FROM transactions").get();
  database.client.prepare("DELETE FROM transactions").run();

  return {
    deletedCount: Number(row.count),
  };
}

export async function getDatabaseStatus(database) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      select
        (select count(*)::int from public.transactions) as transactions,
        (select count(*)::int from public.chat_sessions) as chat_sessions
    `;
    return {
      ok: true,
      kind: "postgres",
      transactions: Number(rows[0].transactions),
      chatSessions: Number(rows[0].chat_sessions),
    };
  }

  const migrationCount = database.client
    .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
    .get();
  const transactionCount = database.client
    .prepare("SELECT COUNT(*) AS count FROM transactions")
    .get();
  const chatSessionCount = database.client
    .prepare("SELECT COUNT(*) AS count FROM chat_sessions")
    .get();

  return {
    ok: true,
    kind: "sqlite",
    migrations: Number(migrationCount.count),
    transactions: Number(transactionCount.count),
    chatSessions: Number(chatSessionCount.count),
  };
}

export async function getChatSession(database, chatId) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      select * from public.chat_sessions where chat_id = ${String(chatId)} limit 1
    `;
    return rows[0] ? mapChatSessionRow(rows[0]) : null;
  }

  const row = database.client
    .prepare("SELECT * FROM chat_sessions WHERE chat_id = ? LIMIT 1")
    .get(String(chatId));

  return row ? mapChatSessionRow(row) : null;
}

export async function setChatSessionMode(database, chatId, mode) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      insert into public.chat_sessions (chat_id, pending_input_mode, pending_action, updated_at)
      values (${String(chatId)}, ${mode}, null, now())
      on conflict (chat_id)
      do update set pending_input_mode = excluded.pending_input_mode, pending_action = null, updated_at = now()
      returning *
    `;
    return mapChatSessionRow(rows[0]);
  }

  const now = new Date().toISOString();
  database.client
    .prepare(
      `INSERT INTO chat_sessions (chat_id, pending_input_mode, pending_action, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?)
       ON CONFLICT(chat_id)
       DO UPDATE SET pending_input_mode = excluded.pending_input_mode, pending_action = NULL, updated_at = excluded.updated_at`,
    )
    .run(String(chatId), mode, now, now);

  return getChatSession(database, chatId);
}

export async function clearChatSessionMode(database, chatId) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      update public.chat_sessions
      set pending_input_mode = null, updated_at = now()
      where chat_id = ${String(chatId)}
      returning *
    `;
    return rows[0] ? mapChatSessionRow(rows[0]) : null;
  }

  const now = new Date().toISOString();
  database.client
    .prepare("UPDATE chat_sessions SET pending_input_mode = NULL, updated_at = ? WHERE chat_id = ?")
    .run(now, String(chatId));

  return getChatSession(database, chatId);
}

export async function setChatSessionPendingAction(database, chatId, action) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      insert into public.chat_sessions (chat_id, pending_input_mode, pending_action, updated_at)
      values (${String(chatId)}, null, ${action}, now())
      on conflict (chat_id)
      do update set pending_input_mode = null, pending_action = excluded.pending_action, updated_at = now()
      returning *
    `;
    return mapChatSessionRow(rows[0]);
  }

  const now = new Date().toISOString();
  database.client
    .prepare(
      `INSERT INTO chat_sessions (chat_id, pending_input_mode, pending_action, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?)
       ON CONFLICT(chat_id)
       DO UPDATE SET pending_input_mode = NULL, pending_action = excluded.pending_action, updated_at = excluded.updated_at`,
    )
    .run(String(chatId), action, now, now);

  return getChatSession(database, chatId);
}

export async function clearChatSessionPendingAction(database, chatId) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      update public.chat_sessions
      set pending_action = null, updated_at = now()
      where chat_id = ${String(chatId)}
      returning *
    `;
    return rows[0] ? mapChatSessionRow(rows[0]) : null;
  }

  const now = new Date().toISOString();
  database.client
    .prepare("UPDATE chat_sessions SET pending_action = NULL, updated_at = ? WHERE chat_id = ?")
    .run(now, String(chatId));

  return getChatSession(database, chatId);
}

function listPostgresTransactions(database, { limit, offset, from, to }) {
  if (from && to) {
    return database.client`
      select * from public.transactions
      where created_at >= ${from} and created_at < ${to}
      order by id desc
      limit ${limit}
      offset ${offset}
    `.then((rows) => rows.map(mapTransactionRow));
  }

  if (from) {
    return database.client`
      select * from public.transactions
      where created_at >= ${from}
      order by id desc
      limit ${limit}
      offset ${offset}
    `.then((rows) => rows.map(mapTransactionRow));
  }

  if (to) {
    return database.client`
      select * from public.transactions
      where created_at < ${to}
      order by id desc
      limit ${limit}
      offset ${offset}
    `.then((rows) => rows.map(mapTransactionRow));
  }

  return database.client`
    select * from public.transactions
    order by id desc
    limit ${limit}
    offset ${offset}
  `.then((rows) => rows.map(mapTransactionRow));
}

function buildPostgresPeriodWhere(sql, { from, to } = {}) {
  if (from && to) {
    return sql`where created_at >= ${from} and created_at < ${to}`;
  }

  if (from) {
    return sql`where created_at >= ${from}`;
  }

  if (to) {
    return sql`where created_at < ${to}`;
  }

  return sql``;
}

function mapSummaryRow(row) {
  const totalIncome = Number(row.total_income);
  const totalExpense = Number(row.total_expense);

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    transactionCount: Number(row.transaction_count),
  };
}

function mapCategorySummaryRow(row) {
  return {
    category: row.category,
    totalIncome: Number(row.total_income),
    totalExpense: Number(row.total_expense),
    transactionCount: Number(row.transaction_count),
  };
}

function mapTransactionRow(row) {
  return {
    id: Number(row.id),
    type: row.type,
    amount: Number(row.amount),
    note: row.note,
    category: row.category,
    paymentMethod: row.payment_method,
    date: row.date_kind
      ? {
          kind: row.date_kind,
          value: row.date_value,
        }
      : null,
    tags: parseTags(row.tags_json),
    rawAmount: row.raw_amount,
    original: row.original,
    confidence: Number(row.confidence),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function mapChatSessionRow(row) {
  return {
    id: Number(row.id),
    chatId: row.chat_id,
    pendingInputMode: row.pending_input_mode,
    pendingAction: row.pending_action,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function normalizeTimestamp(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return min;
  }

  return Math.min(max, Math.max(min, parsed));
}

function buildSqlitePeriodFilter({ from, to } = {}) {
  const clauses = [];
  const params = [];

  if (from) {
    clauses.push("created_at >= ?");
    params.push(from);
  }

  if (to) {
    clauses.push("created_at < ?");
    params.push(to);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}
