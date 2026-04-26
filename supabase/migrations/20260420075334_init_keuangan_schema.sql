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
);

create index if not exists idx_transactions_created_at
  on public.transactions (created_at desc);

create index if not exists idx_transactions_type_created_at
  on public.transactions (type, created_at desc);

create index if not exists idx_transactions_category_created_at
  on public.transactions (category, created_at desc);

create table if not exists public.chat_sessions (
  id bigint generated always as identity primary key,
  chat_id text not null unique,
  pending_input_mode text check (pending_input_mode in ('income', 'expense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_sessions_chat_id
  on public.chat_sessions (chat_id);

-- Enable RLS for security. This migration assumes service-role or table-owner access.
-- Restricted roles (anon, authenticated) require explicit policies before use.
alter table public.transactions enable row level security;
alter table public.chat_sessions enable row level security;
