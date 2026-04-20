alter table public.chat_sessions
  add column if not exists pending_action text check (pending_action in ('reset_confirm'));
