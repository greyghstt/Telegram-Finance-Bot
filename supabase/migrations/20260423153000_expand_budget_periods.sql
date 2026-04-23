alter table public.budgets
  drop constraint if exists budgets_period_check;

alter table public.budgets
  add constraint budgets_period_check
  check (period in ('weekly', 'monthly', 'yearly'));
