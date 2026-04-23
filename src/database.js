import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

const DEFAULT_DB_PATH = resolve("data", "telegram-finance-bot.sqlite");

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
        wallet text,
        payment_method text,
        date_kind text,
        date_value text,
        tags_json jsonb not null default '[]'::jsonb,
        raw_amount text,
        original text not null,
        confidence real not null default 0,
        deleted_at timestamptz,
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
        pending_action text check (pending_action in ('reset_confirm', 'budget_reset_confirm', 'transaction_clarify', 'undo_delete')),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await database.client`create index if not exists idx_chat_sessions_chat_id on public.chat_sessions (chat_id)`;
    await database.client`
      alter table public.chat_sessions
      add column if not exists pending_action text
    `;
    await database.client`alter table public.chat_sessions drop constraint if exists chat_sessions_pending_action_check`;
    await database.client`
      alter table public.chat_sessions
      add constraint chat_sessions_pending_action_check
      check (pending_action in ('reset_confirm', 'budget_reset_confirm', 'transaction_clarify', 'undo_delete'))
    `;
    await database.client`
      alter table public.transactions
      add column if not exists deleted_at timestamptz
    `;
    await database.client`
      create table if not exists public.budgets (
        id bigint generated always as identity primary key,
        chat_id text not null,
        category text not null,
        period text not null default 'monthly' check (period in ('weekly', 'monthly', 'yearly')),
        monthly_limit integer not null check (monthly_limit > 0),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (chat_id, category, period)
      )
    `;
    await database.client`create index if not exists idx_budgets_chat_period on public.budgets (chat_id, period)`;
    await database.client`
      create table if not exists public.custom_categories (
        id bigint generated always as identity primary key,
        chat_id text not null,
        category text not null,
        label text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (chat_id, category)
      )
    `;
    await database.client`create index if not exists idx_custom_categories_chat_id on public.custom_categories (chat_id)`;
    await database.client`
      create table if not exists public.category_aliases (
        id bigint generated always as identity primary key,
        chat_id text not null,
        alias text not null,
        category text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (chat_id, alias)
      )
    `;
    await database.client`create index if not exists idx_category_aliases_chat_id on public.category_aliases (chat_id)`;
    await database.client`
      create table if not exists public.wallets (
        id bigint generated always as identity primary key,
        chat_id text not null,
        name text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (chat_id, name)
      )
    `;
    await database.client`create index if not exists idx_wallets_chat_id on public.wallets (chat_id)`;
    await database.client`
      create table if not exists public.transfers (
        id bigint generated always as identity primary key,
        chat_id text not null,
        from_wallet text not null,
        to_wallet text not null,
        amount integer not null check (amount > 0),
        note text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await database.client`create index if not exists idx_transfers_chat_id on public.transfers (chat_id, created_at desc)`;
    await database.client`
      create table if not exists public.recurring_rules (
        id bigint generated always as identity primary key,
        chat_id text not null,
        cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
        template_message text not null,
        next_run_at timestamptz not null,
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await database.client`create index if not exists idx_recurring_rules_chat_id on public.recurring_rules (chat_id, next_run_at)`;
    await database.client`
      create table if not exists public.bill_reminders (
        id bigint generated always as identity primary key,
        chat_id text not null,
        title text not null,
        amount integer,
        category text,
        due_day integer not null check (due_day between 1 and 31),
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await database.client`create index if not exists idx_bill_reminders_chat_id on public.bill_reminders (chat_id, due_day)`;
    await database.client`
      alter table public.chat_sessions
      add column if not exists pending_payload jsonb
    `;
    await database.client`
      alter table public.transactions
      add column if not exists wallet text
    `;
    await database.client`alter table public.transactions enable row level security`;
    await database.client`alter table public.chat_sessions enable row level security`;
    await database.client`alter table public.budgets enable row level security`;
    await database.client`alter table public.custom_categories enable row level security`;
    await database.client`alter table public.category_aliases enable row level security`;
    await database.client`alter table public.wallets enable row level security`;
    await database.client`alter table public.transfers enable row level security`;
    await database.client`alter table public.recurring_rules enable row level security`;
    await database.client`alter table public.bill_reminders enable row level security`;
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
      wallet TEXT,
      payment_method TEXT,
      date_kind TEXT,
      date_value TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      raw_amount TEXT,
      original TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      deleted_at TEXT,
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
      pending_action TEXT CHECK (pending_action IN ('reset_confirm', 'budget_reset_confirm', 'transaction_clarify', 'undo_delete')),
      pending_payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_chat_id
      ON chat_sessions (chat_id);

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      category TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('weekly', 'monthly', 'yearly')),
      monthly_limit INTEGER NOT NULL CHECK (monthly_limit > 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(chat_id, category, period)
    );

    CREATE INDEX IF NOT EXISTS idx_budgets_chat_period
      ON budgets (chat_id, period);

    CREATE TABLE IF NOT EXISTS custom_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(chat_id, category)
    );

    CREATE INDEX IF NOT EXISTS idx_custom_categories_chat_id
      ON custom_categories (chat_id);

    CREATE TABLE IF NOT EXISTS category_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(chat_id, alias)
    );

    CREATE INDEX IF NOT EXISTS idx_category_aliases_chat_id
      ON category_aliases (chat_id);

    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(chat_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_wallets_chat_id
      ON wallets (chat_id);

    CREATE TABLE IF NOT EXISTS transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      from_wallet TEXT NOT NULL,
      to_wallet TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transfers_chat_id
      ON transfers (chat_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS recurring_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly')),
      template_message TEXT NOT NULL,
      next_run_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_recurring_rules_chat_id
      ON recurring_rules (chat_id, next_run_at);

    CREATE TABLE IF NOT EXISTS bill_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      title TEXT NOT NULL,
      amount INTEGER,
      category TEXT,
      due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bill_reminders_chat_id
      ON bill_reminders (chat_id, due_day);
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
      ADD COLUMN pending_action TEXT CHECK (pending_action IN ('reset_confirm', 'budget_reset_confirm', 'transaction_clarify', 'undo_delete'));
    `);
  } catch (error) {
    if (!String(error.message).includes("duplicate column name")) {
      throw error;
    }
  }

  try {
    database.client.exec("ALTER TABLE chat_sessions ADD COLUMN pending_payload TEXT;");
  } catch (error) {
    if (!String(error.message).includes("duplicate column name")) {
      throw error;
    }
  }

  try {
    database.client.exec("ALTER TABLE transactions ADD COLUMN deleted_at TEXT;");
  } catch (error) {
    if (!String(error.message).includes("duplicate column name")) {
      throw error;
    }
  }

  try {
    database.client.exec("ALTER TABLE transactions ADD COLUMN wallet TEXT;");
  } catch (error) {
    if (!String(error.message).includes("duplicate column name")) {
      throw error;
    }
  }

  migrateSqliteChatSessionsTable(database);
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
        wallet,
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
        ${transaction.wallet ?? null},
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
        wallet,
        payment_method,
        date_kind,
        date_value,
        tags_json,
        raw_amount,
        original,
        confidence,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      transaction.type,
      transaction.amount,
      transaction.note,
      transaction.category ?? "other",
      transaction.wallet ?? null,
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
    const rows = await database.client`
      select *
      from public.transactions
      where id = ${id} and deleted_at is null
    `;
    return rows[0] ? mapTransactionRow(rows[0]) : null;
  }

  const row = database.client
    .prepare("SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL")
    .get(id);
  return row ? mapTransactionRow(row) : null;
}

export async function getDeletedTransactionById(database, id) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      select *
      from public.transactions
      where id = ${id} and deleted_at is not null
    `;
    return rows[0] ? mapTransactionRow(rows[0]) : null;
  }

  const row = database.client
    .prepare("SELECT * FROM transactions WHERE id = ? AND deleted_at IS NOT NULL")
    .get(id);
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
       WHERE deleted_at IS NULL
       ${period.where ? `AND ${period.where.slice(6)}` : ""}
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
        deleted_at is null
        and (
          note ilike ${pattern}
          or category ilike ${pattern}
          or coalesce(payment_method, '') ilike ${pattern}
          or original ilike ${pattern}
          or tags_json::text ilike ${pattern}
        )
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
        deleted_at IS NULL
        AND (
          lower(note) LIKE ?
          OR lower(category) LIKE ?
          OR lower(coalesce(payment_method, '')) LIKE ?
          OR lower(original) LIKE ?
          OR lower(tags_json) LIKE ?
        )
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
      ${appendPostgresClause(database.client, where, database.client`deleted_at is null`)}
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
       WHERE deleted_at IS NULL
       ${period.where ? `AND ${period.where.slice(6)}` : ""}`,
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
      ${appendPostgresClause(database.client, where, database.client`deleted_at is null`)}
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
       WHERE deleted_at IS NULL
       ${period.where ? `AND ${period.where.slice(6)}` : ""}
       GROUP BY category
       ORDER BY total_expense DESC, total_income DESC
       LIMIT ?`,
    )
    .all(...period.params, safeLimit)
    .map(mapCategorySummaryRow);
}

export async function saveBudget(database, { chatId, category, monthlyLimit, period = "monthly" }) {
  const cleanChatId = normalizeChatId(chatId);
  const cleanCategory = normalizeCategory(category);
  const limit = Number.parseInt(monthlyLimit, 10);

  if (!cleanCategory || !Number.isSafeInteger(limit) || limit <= 0 || !isValidBudgetPeriod(period)) {
    throw new Error("Budget tidak valid.");
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      insert into public.budgets (chat_id, category, period, monthly_limit, updated_at)
      values (${cleanChatId}, ${cleanCategory}, ${period}, ${limit}, now())
      on conflict (chat_id, category, period)
      do update set monthly_limit = excluded.monthly_limit, updated_at = now()
      returning *
    `;
    return mapBudgetRow(rows[0]);
  }

  const now = new Date().toISOString();
  database.client
    .prepare(
      `INSERT INTO budgets (chat_id, category, period, monthly_limit, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, category, period)
       DO UPDATE SET monthly_limit = excluded.monthly_limit, updated_at = excluded.updated_at`,
    )
    .run(cleanChatId, cleanCategory, period, limit, now, now);

  return getBudget(database, cleanChatId, cleanCategory, period);
}

export async function listBudgets(database, chatId, { period = "monthly" } = {}) {
  const cleanChatId = normalizeChatId(chatId);

  if (!isValidBudgetPeriod(period)) {
    return [];
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      select *
      from public.budgets
      where chat_id = ${cleanChatId} and period = ${period}
      order by category asc
    `;
    return rows.map(mapBudgetRow);
  }

  return database.client
    .prepare(
      `SELECT *
       FROM budgets
       WHERE chat_id = ? AND period = ?
       ORDER BY category ASC`,
    )
    .all(cleanChatId, period)
    .map(mapBudgetRow);
}

export async function deleteBudget(database, chatId, category, { period = "monthly" } = {}) {
  const cleanChatId = normalizeChatId(chatId);
  const cleanCategory = normalizeCategory(category);

  if (!cleanCategory || !isValidBudgetPeriod(period)) {
    return null;
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      delete from public.budgets
      where chat_id = ${cleanChatId} and category = ${cleanCategory} and period = ${period}
      returning *
    `;
    return rows[0] ? mapBudgetRow(rows[0]) : null;
  }

  const budget = await getBudget(database, cleanChatId, cleanCategory, period);
  if (!budget) {
    return null;
  }

  database.client
    .prepare("DELETE FROM budgets WHERE chat_id = ? AND category = ? AND period = ?")
    .run(cleanChatId, cleanCategory, period);
  return budget;
}

export async function clearBudgets(database, chatId, { period = "monthly" } = {}) {
  const cleanChatId = normalizeChatId(chatId);

  if (!isValidBudgetPeriod(period)) {
    return { deletedCount: 0 };
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      delete from public.budgets
      where chat_id = ${cleanChatId} and period = ${period}
      returning id
    `;
    return { deletedCount: rows.length };
  }

  const row = database.client
    .prepare("SELECT COUNT(*) AS count FROM budgets WHERE chat_id = ? AND period = ?")
    .get(cleanChatId, period);
  database.client
    .prepare("DELETE FROM budgets WHERE chat_id = ? AND period = ?")
    .run(cleanChatId, period);
  return { deletedCount: Number(row.count) };
}

export async function getBudgetProgress(database, chatId, { from, to, period = "monthly" } = {}) {
  const budgets = await listBudgets(database, chatId, { period });
  const categories = await getCategorySummary(database, { from, to, limit: 20 });
  const summary = await getSummary(database, { from, to });

  return budgets.map((budget) => {
    const category = categories.find((item) => item.category === budget.category);
    const spent = budget.category === "global" ? summary.totalExpense : (category?.totalExpense ?? 0);
    const percent = budget.monthlyLimit > 0 ? Math.round((spent / budget.monthlyLimit) * 100) : 0;

    return {
      ...budget,
      spent,
      remaining: budget.monthlyLimit - spent,
      percent,
      status: percent >= 100 ? "over" : percent >= 80 ? "warning" : "ok",
    };
  });
}

export async function saveCustomCategory(database, { chatId, category, label }) {
  const cleanChatId = normalizeChatId(chatId);
  const cleanCategory = normalizeCategory(category);
  const cleanLabel = normalizeLabel(label || cleanCategory);

  if (!cleanCategory || !cleanLabel) {
    throw new Error("Kategori tidak valid.");
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      insert into public.custom_categories (chat_id, category, label, updated_at)
      values (${cleanChatId}, ${cleanCategory}, ${cleanLabel}, now())
      on conflict (chat_id, category)
      do update set label = excluded.label, updated_at = now()
      returning *
    `;
    return mapCustomCategoryRow(rows[0]);
  }

  const now = new Date().toISOString();
  database.client
    .prepare(
      `INSERT INTO custom_categories (chat_id, category, label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, category)
       DO UPDATE SET label = excluded.label, updated_at = excluded.updated_at`,
    )
    .run(cleanChatId, cleanCategory, cleanLabel, now, now);

  return getCustomCategory(database, cleanChatId, cleanCategory);
}

export async function saveWallet(database, { chatId, name }) {
  const cleanChatId = normalizeChatId(chatId);
  const cleanName = normalizeWalletName(name);

  if (!cleanName) {
    throw new Error("Wallet tidak valid.");
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      insert into public.wallets (chat_id, name, updated_at)
      values (${cleanChatId}, ${cleanName}, now())
      on conflict (chat_id, name)
      do update set updated_at = now()
      returning *
    `;
    return mapWalletRow(rows[0]);
  }

  const now = new Date().toISOString();
  database.client
    .prepare(
      `INSERT INTO wallets (chat_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chat_id, name)
       DO UPDATE SET updated_at = excluded.updated_at`,
    )
    .run(cleanChatId, cleanName, now, now);

  return getWallet(database, cleanChatId, cleanName);
}

export async function listWallets(database, chatId) {
  const cleanChatId = normalizeChatId(chatId);

  if (database.kind === "postgres") {
    const rows = await database.client`
      select * from public.wallets where chat_id = ${cleanChatId} order by name asc
    `;
    return rows.map(mapWalletRow);
  }

  return database.client
    .prepare("SELECT * FROM wallets WHERE chat_id = ? ORDER BY name ASC")
    .all(cleanChatId)
    .map(mapWalletRow);
}

export async function saveTransfer(database, { chatId, fromWallet, toWallet, amount, note = "" }) {
  const cleanChatId = normalizeChatId(chatId);
  const from = normalizeWalletName(fromWallet);
  const to = normalizeWalletName(toWallet);
  const parsedAmount = Number.parseInt(amount, 10);

  if (!from || !to || from === to || !Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Transfer tidak valid.");
  }

  await saveWallet(database, { chatId: cleanChatId, name: from });
  await saveWallet(database, { chatId: cleanChatId, name: to });

  if (database.kind === "postgres") {
    const rows = await database.client`
      insert into public.transfers (chat_id, from_wallet, to_wallet, amount, note, updated_at)
      values (${cleanChatId}, ${from}, ${to}, ${parsedAmount}, ${note || null}, now())
      returning *
    `;
    return mapTransferRow(rows[0]);
  }

  const now = new Date().toISOString();
  const result = database.client
    .prepare(
      `INSERT INTO transfers (chat_id, from_wallet, to_wallet, amount, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(cleanChatId, from, to, parsedAmount, note || null, now, now);

  return getTransferById(database, Number(result.lastInsertRowid));
}

export async function listTransfers(database, chatId, { limit = 20 } = {}) {
  const cleanChatId = normalizeChatId(chatId);
  const safeLimit = clampInteger(limit, 1, 100);

  if (database.kind === "postgres") {
    const rows = await database.client`
      select * from public.transfers where chat_id = ${cleanChatId} order by id desc limit ${safeLimit}
    `;
    return rows.map(mapTransferRow);
  }

  return database.client
    .prepare("SELECT * FROM transfers WHERE chat_id = ? ORDER BY id DESC LIMIT ?")
    .all(cleanChatId, safeLimit)
    .map(mapTransferRow);
}

export async function getWalletBalances(database, chatId) {
  const wallets = await listWallets(database, chatId);
  const transfers = await listTransfers(database, chatId, { limit: 1000 });
  const transactions = await listTransactions(database, { limit: 1000 });

  return wallets.map((wallet) => {
    const transactionDelta = transactions
      .filter((transaction) => transaction.wallet === wallet.name)
      .reduce((total, transaction) => total + (transaction.type === "income" ? transaction.amount : -transaction.amount), 0);
    const transferIn = transfers
      .filter((transfer) => transfer.toWallet === wallet.name)
      .reduce((total, transfer) => total + transfer.amount, 0);
    const transferOut = transfers
      .filter((transfer) => transfer.fromWallet === wallet.name)
      .reduce((total, transfer) => total + transfer.amount, 0);

    return {
      ...wallet,
      balance: transactionDelta + transferIn - transferOut,
      transactionDelta,
      transferIn,
      transferOut,
    };
  });
}

export async function saveRecurringRule(database, { chatId, cadence, templateMessage, nextRunAt }) {
  const cleanChatId = normalizeChatId(chatId);
  const cleanCadence = normalizeCadence(cadence);
  const cleanTemplate = String(templateMessage ?? "").trim();
  const cleanNextRunAt = String(nextRunAt ?? "").trim();

  if (!cleanCadence || !cleanTemplate || !cleanNextRunAt) {
    throw new Error("Recurring rule tidak valid.");
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      insert into public.recurring_rules (chat_id, cadence, template_message, next_run_at, updated_at)
      values (${cleanChatId}, ${cleanCadence}, ${cleanTemplate}, ${cleanNextRunAt}, now())
      returning *
    `;
    return mapRecurringRuleRow(rows[0]);
  }

  const now = new Date().toISOString();
  const result = database.client
    .prepare(
      `INSERT INTO recurring_rules (chat_id, cadence, template_message, next_run_at, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(cleanChatId, cleanCadence, cleanTemplate, cleanNextRunAt, now, now);

  return getRecurringRuleById(database, Number(result.lastInsertRowid));
}

export async function listRecurringRules(database, chatId) {
  const cleanChatId = normalizeChatId(chatId);

  if (database.kind === "postgres") {
    const rows = await database.client`
      select * from public.recurring_rules where chat_id = ${cleanChatId} and active = true order by id asc
    `;
    return rows.map(mapRecurringRuleRow);
  }

  return database.client
    .prepare("SELECT * FROM recurring_rules WHERE chat_id = ? AND active = 1 ORDER BY id ASC")
    .all(cleanChatId)
    .map(mapRecurringRuleRow);
}

export async function deleteRecurringRule(database, id) {
  const ruleId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(ruleId) || ruleId <= 0) {
    return null;
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      update public.recurring_rules set active = false, updated_at = now() where id = ${ruleId} returning *
    `;
    return rows[0] ? mapRecurringRuleRow(rows[0]) : null;
  }

  const now = new Date().toISOString();
  const result = database.client
    .prepare("UPDATE recurring_rules SET active = 0, updated_at = ? WHERE id = ?")
    .run(now, ruleId);
  return result.changes > 0 ? getRecurringRuleById(database, ruleId) : null;
}

export async function listDueRecurringRules(database, now = new Date()) {
  const stamp = now.toISOString();
  if (database.kind === "postgres") {
    const rows = await database.client`
      select * from public.recurring_rules where active = true and next_run_at <= ${stamp} order by next_run_at asc
    `;
    return rows.map(mapRecurringRuleRow);
  }

  return database.client
    .prepare("SELECT * FROM recurring_rules WHERE active = 1 AND next_run_at <= ? ORDER BY next_run_at ASC")
    .all(stamp)
    .map(mapRecurringRuleRow);
}

export async function advanceRecurringRule(database, id, nextRunAt) {
  const ruleId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(ruleId) || ruleId <= 0) {
    return null;
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      update public.recurring_rules set next_run_at = ${nextRunAt}, updated_at = now() where id = ${ruleId} returning *
    `;
    return rows[0] ? mapRecurringRuleRow(rows[0]) : null;
  }

  const now = new Date().toISOString();
  const result = database.client
    .prepare("UPDATE recurring_rules SET next_run_at = ?, updated_at = ? WHERE id = ?")
    .run(nextRunAt, now, ruleId);
  return result.changes > 0 ? getRecurringRuleById(database, ruleId) : null;
}

export async function saveBillReminder(database, { chatId, title, amount = null, category = null, dueDay }) {
  const cleanChatId = normalizeChatId(chatId);
  const cleanTitle = String(title ?? "").trim();
  const parsedAmount = amount == null ? null : Number.parseInt(amount, 10);
  const parsedDueDay = Number.parseInt(dueDay, 10);
  const cleanCategory = category ? normalizeCategory(category) : null;

  if (!cleanTitle || !Number.isSafeInteger(parsedDueDay) || parsedDueDay < 1 || parsedDueDay > 31) {
    throw new Error("Reminder tagihan tidak valid.");
  }

  if (amount != null && (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0)) {
    throw new Error("Nominal tagihan tidak valid.");
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      insert into public.bill_reminders (chat_id, title, amount, category, due_day, updated_at)
      values (${cleanChatId}, ${cleanTitle}, ${parsedAmount}, ${cleanCategory}, ${parsedDueDay}, now())
      returning *
    `;
    return mapBillReminderRow(rows[0]);
  }

  const now = new Date().toISOString();
  const result = database.client
    .prepare(
      `INSERT INTO bill_reminders (chat_id, title, amount, category, due_day, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(cleanChatId, cleanTitle, parsedAmount, cleanCategory, parsedDueDay, now, now);

  return getBillReminderById(database, Number(result.lastInsertRowid));
}

export async function listBillReminders(database, chatId) {
  const cleanChatId = normalizeChatId(chatId);

  if (database.kind === "postgres") {
    const rows = await database.client`
      select * from public.bill_reminders where chat_id = ${cleanChatId} and active = true order by due_day asc, id asc
    `;
    return rows.map(mapBillReminderRow);
  }

  return database.client
    .prepare("SELECT * FROM bill_reminders WHERE chat_id = ? AND active = 1 ORDER BY due_day ASC, id ASC")
    .all(cleanChatId)
    .map(mapBillReminderRow);
}

export async function deleteBillReminder(database, id) {
  const reminderId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(reminderId) || reminderId <= 0) {
    return null;
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      update public.bill_reminders set active = false, updated_at = now() where id = ${reminderId} returning *
    `;
    return rows[0] ? mapBillReminderRow(rows[0]) : null;
  }

  const now = new Date().toISOString();
  const result = database.client
    .prepare("UPDATE bill_reminders SET active = 0, updated_at = ? WHERE id = ?")
    .run(now, reminderId);
  return result.changes > 0 ? getBillReminderById(database, reminderId) : null;
}

export async function listDueBillReminders(database, now = new Date(), chatId = null) {
  const day = new Date(now).getUTCDate();
  const cleanChatId = chatId == null ? null : normalizeChatId(chatId);

  if (database.kind === "postgres") {
    const rows = cleanChatId == null
      ? await database.client`
          select * from public.bill_reminders where active = true and due_day = ${day} order by id asc
        `
      : await database.client`
          select *
          from public.bill_reminders
          where active = true and due_day = ${day} and chat_id = ${cleanChatId}
          order by id asc
        `;
    return rows.map(mapBillReminderRow);
  }

  return cleanChatId == null
    ? database.client
      .prepare("SELECT * FROM bill_reminders WHERE active = 1 AND due_day = ? ORDER BY id ASC")
      .all(day)
      .map(mapBillReminderRow)
    : database.client
      .prepare("SELECT * FROM bill_reminders WHERE active = 1 AND due_day = ? AND chat_id = ? ORDER BY id ASC")
      .all(day, cleanChatId)
      .map(mapBillReminderRow);
}

export async function listCustomCategories(database, chatId) {
  const cleanChatId = normalizeChatId(chatId);

  if (database.kind === "postgres") {
    const rows = await database.client`
      select *
      from public.custom_categories
      where chat_id = ${cleanChatId}
      order by category asc
    `;
    return rows.map(mapCustomCategoryRow);
  }

  return database.client
    .prepare(
      `SELECT *
       FROM custom_categories
       WHERE chat_id = ?
       ORDER BY category ASC`,
    )
    .all(cleanChatId)
    .map(mapCustomCategoryRow);
}

export async function saveCategoryAlias(database, { chatId, alias, category }) {
  const cleanChatId = normalizeChatId(chatId);
  const cleanAlias = normalizeAlias(alias);
  const cleanCategory = normalizeCategory(category);

  if (!cleanAlias || !cleanCategory) {
    throw new Error("Alias kategori tidak valid.");
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      insert into public.category_aliases (chat_id, alias, category, updated_at)
      values (${cleanChatId}, ${cleanAlias}, ${cleanCategory}, now())
      on conflict (chat_id, alias)
      do update set category = excluded.category, updated_at = now()
      returning *
    `;
    return mapCategoryAliasRow(rows[0]);
  }

  const now = new Date().toISOString();
  database.client
    .prepare(
      `INSERT INTO category_aliases (chat_id, alias, category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, alias)
       DO UPDATE SET category = excluded.category, updated_at = excluded.updated_at`,
    )
    .run(cleanChatId, cleanAlias, cleanCategory, now, now);

  return getCategoryAlias(database, cleanChatId, cleanAlias);
}

export async function listCategoryAliases(database, chatId) {
  const cleanChatId = normalizeChatId(chatId);

  if (database.kind === "postgres") {
    const rows = await database.client`
      select *
      from public.category_aliases
      where chat_id = ${cleanChatId}
      order by alias asc
    `;
    return rows.map(mapCategoryAliasRow);
  }

  return database.client
    .prepare(
      `SELECT *
       FROM category_aliases
       WHERE chat_id = ?
       ORDER BY alias ASC`,
    )
    .all(cleanChatId)
    .map(mapCategoryAliasRow);
}

export async function updateTransactionCategory(database, id, category) {
  const transactionId = Number.parseInt(id, 10);
  const cleanCategory = normalizeCategory(category);

  if (!Number.isSafeInteger(transactionId) || transactionId <= 0 || !cleanCategory) {
    return null;
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      update public.transactions
      set category = ${cleanCategory}, updated_at = now()
      where id = ${transactionId} and deleted_at is null
      returning *
    `;
    return rows[0] ? mapTransactionRow(rows[0]) : null;
  }

  const now = new Date().toISOString();
  const result = database.client
    .prepare("UPDATE transactions SET category = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(cleanCategory, now, transactionId);

  return result.changes > 0 ? getTransactionById(database, transactionId) : null;
}

export async function updateTransactionById(database, id, transaction) {
  const transactionId = Number.parseInt(id, 10);

  if (!Number.isSafeInteger(transactionId) || transactionId <= 0) {
    return null;
  }

  const payload = normalizeTransactionInput(transaction);

  if (database.kind === "postgres") {
    const rows = await database.client`
      update public.transactions
      set
        type = ${payload.type},
        amount = ${payload.amount},
        note = ${payload.note},
        category = ${payload.category},
        wallet = ${payload.wallet},
        payment_method = ${payload.paymentMethod},
        date_kind = ${payload.dateKind},
        date_value = ${payload.dateValue},
        tags_json = ${database.client.json(payload.tags)},
        raw_amount = ${payload.rawAmount},
        original = ${payload.original},
        confidence = ${payload.confidence},
        updated_at = now()
      where id = ${transactionId} and deleted_at is null
      returning *
    `;
    return rows[0] ? mapTransactionRow(rows[0]) : null;
  }

  const now = new Date().toISOString();
  const result = database.client
    .prepare(
      `UPDATE transactions
       SET type = ?, amount = ?, note = ?, category = ?, wallet = ?, payment_method = ?,
           date_kind = ?, date_value = ?, tags_json = ?, raw_amount = ?,
           original = ?, confidence = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .run(
      payload.type,
      payload.amount,
      payload.note,
      payload.category,
      payload.wallet,
      payload.paymentMethod,
      payload.dateKind,
      payload.dateValue,
      JSON.stringify(payload.tags),
      payload.rawAmount,
      payload.original,
      payload.confidence,
      now,
      transactionId,
    );

  return result.changes > 0 ? getTransactionById(database, transactionId) : null;
}

export async function deleteLastTransaction(database) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      update public.transactions
      set deleted_at = now(), updated_at = now()
      where id = (
        select id from public.transactions
        where deleted_at is null
        order by id desc
        limit 1
      )
      returning *
    `;
    return rows[0] ? mapTransactionRow(rows[0]) : null;
  }

  const row = database.client
    .prepare("SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1")
    .get();

  if (!row) {
    return null;
  }

  const now = new Date().toISOString();
  database.client
    .prepare("UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, row.id);
  return getDeletedTransactionById(database, row.id);
}

export async function deleteTransactionById(database, id) {
  const transactionId = Number.parseInt(id, 10);

  if (!Number.isSafeInteger(transactionId) || transactionId <= 0) {
    return null;
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      update public.transactions
      set deleted_at = now(), updated_at = now()
      where id = ${transactionId} and deleted_at is null
      returning *
    `;
    return rows[0] ? mapTransactionRow(rows[0]) : null;
  }

  const row = database.client
    .prepare("SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL")
    .get(transactionId);

  if (!row) {
    return null;
  }

  const now = new Date().toISOString();
  database.client
    .prepare("UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, transactionId);
  return getDeletedTransactionById(database, transactionId);
}

export async function restoreTransactionById(database, id) {
  const transactionId = Number.parseInt(id, 10);

  if (!Number.isSafeInteger(transactionId) || transactionId <= 0) {
    return null;
  }

  if (database.kind === "postgres") {
    const rows = await database.client`
      update public.transactions
      set deleted_at = null, updated_at = now()
      where id = ${transactionId} and deleted_at is not null
      returning *
    `;
    return rows[0] ? mapTransactionRow(rows[0]) : null;
  }

  const now = new Date().toISOString();
  const result = database.client
    .prepare("UPDATE transactions SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL")
    .run(now, transactionId);

  return result.changes > 0 ? getTransactionById(database, transactionId) : null;
}

export async function clearAllTransactions(database) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      update public.transactions
      set deleted_at = now(), updated_at = now()
      where deleted_at is null
      returning id
    `;
    return {
      deletedCount: rows.length,
    };
  }

  const row = database.client
    .prepare("SELECT COUNT(*) AS count FROM transactions WHERE deleted_at IS NULL")
    .get();
  const now = new Date().toISOString();
  database.client
    .prepare("UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL")
    .run(now, now);

  return {
    deletedCount: Number(row.count),
  };
}

export async function getDatabaseStatus(database) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      select
        (select count(*)::int from public.transactions where deleted_at is null) as transactions,
        (select count(*)::int from public.transactions where deleted_at is not null) as deleted_transactions,
        (select count(*)::int from public.chat_sessions) as chat_sessions,
        (select count(*)::int from public.budgets) as budgets,
        (select count(*)::int from public.custom_categories) as custom_categories,
        (select count(*)::int from public.category_aliases) as category_aliases
    `;
    return {
      ok: true,
      kind: "postgres",
      transactions: Number(rows[0].transactions),
      deletedTransactions: Number(rows[0].deleted_transactions),
      chatSessions: Number(rows[0].chat_sessions),
      budgets: Number(rows[0].budgets),
      customCategories: Number(rows[0].custom_categories),
      categoryAliases: Number(rows[0].category_aliases),
    };
  }

  const migrationCount = database.client
    .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
    .get();
  const transactionCount = database.client
    .prepare("SELECT COUNT(*) AS count FROM transactions WHERE deleted_at IS NULL")
    .get();
  const deletedTransactionCount = database.client
    .prepare("SELECT COUNT(*) AS count FROM transactions WHERE deleted_at IS NOT NULL")
    .get();
  const chatSessionCount = database.client
    .prepare("SELECT COUNT(*) AS count FROM chat_sessions")
    .get();
  const budgetCount = database.client
    .prepare("SELECT COUNT(*) AS count FROM budgets")
    .get();
  const customCategoryCount = database.client
    .prepare("SELECT COUNT(*) AS count FROM custom_categories")
    .get();
  const categoryAliasCount = database.client
    .prepare("SELECT COUNT(*) AS count FROM category_aliases")
    .get();

  return {
    ok: true,
    kind: "sqlite",
    migrations: Number(migrationCount.count),
    transactions: Number(transactionCount.count),
    deletedTransactions: Number(deletedTransactionCount.count),
    chatSessions: Number(chatSessionCount.count),
    budgets: Number(budgetCount.count),
    customCategories: Number(customCategoryCount.count),
    categoryAliases: Number(categoryAliasCount.count),
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
      insert into public.chat_sessions (chat_id, pending_input_mode, pending_action, pending_payload, updated_at)
      values (${String(chatId)}, ${mode}, null, null, now())
      on conflict (chat_id)
      do update set pending_input_mode = excluded.pending_input_mode, pending_action = null, pending_payload = null, updated_at = now()
      returning *
    `;
    return mapChatSessionRow(rows[0]);
  }

  const now = new Date().toISOString();
  database.client
    .prepare(
      `INSERT INTO chat_sessions (chat_id, pending_input_mode, pending_action, pending_payload, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, ?, ?)
       ON CONFLICT(chat_id)
       DO UPDATE SET pending_input_mode = excluded.pending_input_mode, pending_action = NULL, pending_payload = NULL, updated_at = excluded.updated_at`,
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

export async function setChatSessionPendingAction(database, chatId, action, payload = null) {
  const payloadValue = payload == null ? null : JSON.stringify(payload);

  if (database.kind === "postgres") {
    const rows = await database.client`
      insert into public.chat_sessions (chat_id, pending_input_mode, pending_action, pending_payload, updated_at)
      values (${String(chatId)}, null, ${action}, ${payload == null ? null : database.client.json(payload)}, now())
      on conflict (chat_id)
      do update set
        pending_input_mode = null,
        pending_action = excluded.pending_action,
        pending_payload = excluded.pending_payload,
        updated_at = now()
      returning *
    `;
    return mapChatSessionRow(rows[0]);
  }

  const now = new Date().toISOString();
  database.client
    .prepare(
      `INSERT INTO chat_sessions (chat_id, pending_input_mode, pending_action, pending_payload, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?)
       ON CONFLICT(chat_id)
       DO UPDATE SET
        pending_input_mode = NULL,
        pending_action = excluded.pending_action,
        pending_payload = excluded.pending_payload,
        updated_at = excluded.updated_at`,
    )
    .run(String(chatId), action, payloadValue, now, now);

  return getChatSession(database, chatId);
}

export async function clearChatSessionPendingAction(database, chatId) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      update public.chat_sessions
      set pending_action = null, pending_payload = null, updated_at = now()
      where chat_id = ${String(chatId)}
      returning *
    `;
    return rows[0] ? mapChatSessionRow(rows[0]) : null;
  }

  const now = new Date().toISOString();
  database.client
    .prepare("UPDATE chat_sessions SET pending_action = NULL, pending_payload = NULL, updated_at = ? WHERE chat_id = ?")
    .run(now, String(chatId));

  return getChatSession(database, chatId);
}

function listPostgresTransactions(database, { limit, offset, from, to }) {
  if (from && to) {
    return database.client`
      select * from public.transactions
      where deleted_at is null and created_at >= ${from} and created_at < ${to}
      order by id desc
      limit ${limit}
      offset ${offset}
    `.then((rows) => rows.map(mapTransactionRow));
  }

  if (from) {
    return database.client`
      select * from public.transactions
      where deleted_at is null and created_at >= ${from}
      order by id desc
      limit ${limit}
      offset ${offset}
    `.then((rows) => rows.map(mapTransactionRow));
  }

  if (to) {
    return database.client`
      select * from public.transactions
      where deleted_at is null and created_at < ${to}
      order by id desc
      limit ${limit}
      offset ${offset}
    `.then((rows) => rows.map(mapTransactionRow));
  }

  return database.client`
    select * from public.transactions
    where deleted_at is null
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

function appendPostgresClause(sql, baseClause, extraCondition) {
  if (!baseClause || String(baseClause).trim() === "") {
    return sql`where ${extraCondition}`;
  }

  return sql`${baseClause} and ${extraCondition}`;
}

function migrateSqliteChatSessionsTable(database) {
  database.client.exec(`
    BEGIN;
    CREATE TABLE IF NOT EXISTS chat_sessions_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL UNIQUE,
      pending_input_mode TEXT CHECK (pending_input_mode IN ('income', 'expense')),
      pending_action TEXT CHECK (pending_action IN ('reset_confirm', 'budget_reset_confirm', 'transaction_clarify', 'undo_delete')),
      pending_payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO chat_sessions_v2 (id, chat_id, pending_input_mode, pending_action, pending_payload, created_at, updated_at)
    SELECT id, chat_id, pending_input_mode, pending_action, pending_payload, created_at, updated_at
    FROM chat_sessions;

    DROP TABLE chat_sessions;
    ALTER TABLE chat_sessions_v2 RENAME TO chat_sessions;
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_chat_id ON chat_sessions (chat_id);
    COMMIT;
  `);
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

async function getBudget(database, chatId, category, period) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      select *
      from public.budgets
      where chat_id = ${chatId} and category = ${category} and period = ${period}
      limit 1
    `;
    return rows[0] ? mapBudgetRow(rows[0]) : null;
  }

  const row = database.client
    .prepare(
      `SELECT *
       FROM budgets
       WHERE chat_id = ? AND category = ? AND period = ?
       LIMIT 1`,
    )
    .get(chatId, category, period);
  return row ? mapBudgetRow(row) : null;
}

async function getWallet(database, chatId, name) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      select * from public.wallets where chat_id = ${chatId} and name = ${name} limit 1
    `;
    return rows[0] ? mapWalletRow(rows[0]) : null;
  }

  const row = database.client
    .prepare("SELECT * FROM wallets WHERE chat_id = ? AND name = ? LIMIT 1")
    .get(chatId, name);
  return row ? mapWalletRow(row) : null;
}

async function getTransferById(database, id) {
  if (database.kind === "postgres") {
    const rows = await database.client`select * from public.transfers where id = ${id} limit 1`;
    return rows[0] ? mapTransferRow(rows[0]) : null;
  }

  const row = database.client.prepare("SELECT * FROM transfers WHERE id = ? LIMIT 1").get(id);
  return row ? mapTransferRow(row) : null;
}

async function getRecurringRuleById(database, id) {
  if (database.kind === "postgres") {
    const rows = await database.client`select * from public.recurring_rules where id = ${id} limit 1`;
    return rows[0] ? mapRecurringRuleRow(rows[0]) : null;
  }

  const row = database.client.prepare("SELECT * FROM recurring_rules WHERE id = ? LIMIT 1").get(id);
  return row ? mapRecurringRuleRow(row) : null;
}

async function getBillReminderById(database, id) {
  if (database.kind === "postgres") {
    const rows = await database.client`select * from public.bill_reminders where id = ${id} limit 1`;
    return rows[0] ? mapBillReminderRow(rows[0]) : null;
  }

  const row = database.client.prepare("SELECT * FROM bill_reminders WHERE id = ? LIMIT 1").get(id);
  return row ? mapBillReminderRow(row) : null;
}

function mapBudgetRow(row) {
  return {
    id: Number(row.id),
    chatId: row.chat_id,
    category: row.category,
    period: row.period,
    monthlyLimit: Number(row.monthly_limit),
    limitAmount: Number(row.monthly_limit),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function mapWalletRow(row) {
  return {
    id: Number(row.id),
    chatId: row.chat_id,
    name: row.name,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function mapTransferRow(row) {
  return {
    id: Number(row.id),
    chatId: row.chat_id,
    fromWallet: row.from_wallet,
    toWallet: row.to_wallet,
    amount: Number(row.amount),
    note: row.note,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function mapRecurringRuleRow(row) {
  return {
    id: Number(row.id),
    chatId: row.chat_id,
    cadence: row.cadence,
    templateMessage: row.template_message,
    nextRunAt: normalizeTimestamp(row.next_run_at),
    active: Boolean(row.active),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function mapBillReminderRow(row) {
  return {
    id: Number(row.id),
    chatId: row.chat_id,
    title: row.title,
    amount: row.amount == null ? null : Number(row.amount),
    category: row.category,
    dueDay: Number(row.due_day),
    active: Boolean(row.active),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function mapCustomCategoryRow(row) {
  return {
    id: Number(row.id),
    chatId: row.chat_id,
    category: row.category,
    label: row.label,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function mapCategoryAliasRow(row) {
  return {
    id: Number(row.id),
    chatId: row.chat_id,
    alias: row.alias,
    category: row.category,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function mapTransactionRow(row) {
  return {
    id: Number(row.id),
    type: row.type,
    amount: Number(row.amount),
    note: row.note,
    category: row.category,
    wallet: row.wallet,
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
    deletedAt: normalizeTimestamp(row.deleted_at),
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
    pendingPayload: parseJsonValue(row.pending_payload),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

async function getCustomCategory(database, chatId, category) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      select *
      from public.custom_categories
      where chat_id = ${chatId} and category = ${category}
      limit 1
    `;
    return rows[0] ? mapCustomCategoryRow(rows[0]) : null;
  }

  const row = database.client
    .prepare(
      `SELECT *
       FROM custom_categories
       WHERE chat_id = ? AND category = ?
       LIMIT 1`,
    )
    .get(chatId, category);
  return row ? mapCustomCategoryRow(row) : null;
}

async function getCategoryAlias(database, chatId, alias) {
  if (database.kind === "postgres") {
    const rows = await database.client`
      select *
      from public.category_aliases
      where chat_id = ${chatId} and alias = ${alias}
      limit 1
    `;
    return rows[0] ? mapCategoryAliasRow(rows[0]) : null;
  }

  const row = database.client
    .prepare(
      `SELECT *
       FROM category_aliases
       WHERE chat_id = ? AND alias = ?
       LIMIT 1`,
    )
    .get(chatId, alias);
  return row ? mapCategoryAliasRow(row) : null;
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

  const parsed = parseJsonValue(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function parseJsonValue(value, fallback = null) {
  if (value && typeof value === "object") {
    return value;
  }

  try {
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTransactionInput(transaction) {
  return {
    type: transaction.type,
    amount: Number(transaction.amount),
    note: transaction.note,
    category: transaction.category,
    wallet: transaction.wallet ?? null,
    paymentMethod: transaction.paymentMethod ?? null,
    dateKind: transaction.date?.kind ?? null,
    dateValue: transaction.date?.value ?? null,
    tags: Array.isArray(transaction.tags) ? transaction.tags : [],
    rawAmount: transaction.rawAmount ?? null,
    original: transaction.original,
    confidence: Number(transaction.confidence ?? 0),
  };
}

function normalizeChatId(value) {
  return String(value ?? "default").trim() || "default";
}

function normalizeCategory(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function normalizeWalletName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}

function isValidBudgetPeriod(value) {
  return ["weekly", "monthly", "yearly"].includes(String(value ?? "").trim());
}

function normalizeCadence(value) {
  const cadence = String(value ?? "").trim().toLowerCase();
  return ["daily", "weekly", "monthly"].includes(cadence) ? cadence : "";
}

function normalizeAlias(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
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
