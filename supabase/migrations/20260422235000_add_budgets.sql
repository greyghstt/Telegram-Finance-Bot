begin;

alter table public.chat_sessions
  drop constraint if exists chat_sessions_pending_action_check;

alter table public.chat_sessions
  add constraint chat_sessions_pending_action_check
  check (pending_action in ('reset_confirm', 'budget_reset_confirm', 'transaction_clarify'));

create table if not exists public.budgets (
  id bigint generated always as identity primary key,
  chat_id text not null,
  category text not null,
  period text not null default 'monthly' check (period in ('monthly')),
  monthly_limit integer not null check (monthly_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chat_id, category, period)
);

create index if not exists idx_budgets_chat_period
  on public.budgets (chat_id, period);

alter table public.budgets enable row level security;

commit;
