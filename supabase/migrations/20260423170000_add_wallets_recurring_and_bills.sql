alter table public.transactions
  add column if not exists wallet text;

create table if not exists public.wallets (
  id bigserial primary key,
  chat_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chat_id, name)
);

create index if not exists idx_wallets_chat_id
  on public.wallets (chat_id);

create table if not exists public.transfers (
  id bigserial primary key,
  chat_id text not null,
  from_wallet text not null,
  to_wallet text not null,
  amount bigint not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transfers_chat_id
  on public.transfers (chat_id, created_at desc);

create table if not exists public.recurring_rules (
  id bigserial primary key,
  chat_id text not null,
  cadence text not null,
  template_message text not null,
  next_run_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_rules_cadence_check check (cadence in ('daily', 'weekly', 'monthly'))
);

create index if not exists idx_recurring_rules_chat_id
  on public.recurring_rules (chat_id, next_run_at);

create table if not exists public.bill_reminders (
  id bigserial primary key,
  chat_id text not null,
  title text not null,
  amount bigint,
  category text,
  due_day integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bill_reminders_due_day_check check (due_day between 1 and 31)
);

create index if not exists idx_bill_reminders_chat_id
  on public.bill_reminders (chat_id, due_day);
