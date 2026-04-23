create table if not exists public.custom_categories (
  id bigint generated always as identity primary key,
  chat_id text not null,
  category text not null,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chat_id, category)
);

create index if not exists idx_custom_categories_chat_id
  on public.custom_categories (chat_id);

create table if not exists public.category_aliases (
  id bigint generated always as identity primary key,
  chat_id text not null,
  alias text not null,
  category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chat_id, alias)
);

create index if not exists idx_category_aliases_chat_id
  on public.category_aliases (chat_id);

alter table public.chat_sessions
  add column if not exists pending_payload jsonb;

alter table public.custom_categories enable row level security;
alter table public.category_aliases enable row level security;
