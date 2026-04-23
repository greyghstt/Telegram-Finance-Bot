alter table public.transactions
  add column if not exists deleted_at timestamptz;

alter table public.chat_sessions
  drop constraint if exists chat_sessions_pending_action_check;

alter table public.chat_sessions
  add constraint chat_sessions_pending_action_check
  check (pending_action in ('reset_confirm', 'budget_reset_confirm', 'transaction_clarify', 'undo_delete'));
