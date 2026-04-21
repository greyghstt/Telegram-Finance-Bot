# Project Plan: Telegram Finance Bot

This document keeps the project direction clear. The repository, project
metadata, and documentation are in English. The live Telegram bot still uses
Indonesian commands, parser examples, and replies for now.

## Goal

Build a private Telegram bot for tracking income and expenses through chat.

Core chat examples:

```text
-20k bensin
+500k gaji
saldo
hari ini
hapus terakhir
```

Manual transactions must start with:

- `+` for income.
- `-` for expense.

## Principles

- Keep secrets in environment variables, never in Git.
- Keep the Telegram webhook server-side only.
- Keep the Indonesian parser and bot replies stable for the current user.
- Use Supabase Postgres in production and SQLite for local development/tests.
- Keep Vercel functions close to Supabase by using region `syd1`.
- Require confirmation for destructive actions.
- Run automated checks before deployment.

## Current Architecture

```text
Telegram
  -> Vercel webhook
  -> Telegram service
  -> Supabase Postgres
```

Local development can still use:

```text
Local polling bot
  -> Telegram service
  -> SQLite
```

## Production Resources

- Production URL: `https://keuangan-telegram.vercel.app`
- Webhook URL:
  `https://keuangan-telegram.vercel.app/api/telegram/webhook`
- GitHub repository: `https://github.com/greyghstt/telegram-finance-bot`
- Vercel project: `telegram-finance-bot`
- Note: the public production domain remains `keuangan-telegram.vercel.app`
  because the shorter English `telegram-finance-bot.vercel.app` alias is not
  available, and generated Vercel aliases are protected by Vercel
  Authentication.
- Supabase region: Oceania/Sydney
- Vercel function region: `syd1`

## Completed Milestones

1. Backend project setup.
2. Parser for Indonesian transaction input.
3. SQLite database adapter for local development.
4. Supabase Postgres adapter for production.
5. Transaction recording.
6. Balance and period reports.
7. Telegram polling runner for local testing.
8. Reusable Telegram service.
9. Vercel webhook endpoint.
10. Supabase migrations.
11. Vercel deployment.
12. Telegram webhook setup.
13. Webhook secret validation.
14. Admin token protection.
15. CSV export as Telegram document.
16. Reset-all flow with `YA RESET` confirmation.
17. Search and category summary commands.
18. Delete transaction by ID.
19. Production health check script.
20. MIT license.
21. Public-ready clean Git history.

## Database

Production uses Supabase Postgres. Local development and tests can use SQLite.

Tables:

```text
transactions
chat_sessions
```

`transactions` stores:

```text
id
type
amount
note
category
payment_method
date_kind
date_value
tags_json
raw_amount
original
confidence
created_at
updated_at
```

`chat_sessions` stores:

```text
id
chat_id
pending_input_mode
pending_action
created_at
updated_at
```

Migrations:

```text
supabase/migrations/20260420075334_init_keuangan_schema.sql
supabase/migrations/20260420100000_add_chat_session_pending_action.sql
```

The migration filenames still keep their original names to preserve migration
history. Their content is safe and does not contain secrets.

## Telegram Behavior

Visible Telegram UX remains Indonesian:

```text
/pemasukan
/pengeluaran
/saldo
/hariini
/mingguini
/bulanini
/riwayat
/kategori
/hapusterakhir
/export
/reset
/batal
```

Text commands:

```text
saldo
hari ini
minggu ini
bulan ini
tahun ini
riwayat
kategori
cari bensin
hapus terakhir
hapus 12
export csv
reset
```

Input modes:

- `/pemasukan` lets the next message omit `+`.
- `/pengeluaran` lets the next message omit `-`.
- `/batal` clears pending input mode or reset confirmation.

## Security Checklist

- `.env` is ignored by Git.
- `.env.example` contains only dummy values.
- Telegram token has been revoked and replaced.
- Supabase database password has been rotated.
- `TELEGRAM_ALLOWED_CHAT_IDS` limits bot access.
- `TELEGRAM_WEBHOOK_SECRET` protects the webhook endpoint.
- `ADMIN_API_TOKEN` protects admin endpoints.
- The current Git history has been rewritten to remove old private values.
- Secret scans should be run before making the repository public.

## Deployment Checklist

Before deployment:

```powershell
npm.cmd test
npm.cmd run test:local-chat
```

Deploy:

```powershell
vercel.cmd deploy --prod --yes
```

Reset webhook:

```powershell
$env:TELEGRAM_WEBHOOK_URL="https://keuangan-telegram.vercel.app/api/telegram/webhook"
npm.cmd run setup:webhook
```

Verify:

```powershell
npm.cmd run check:production
```

## Operational Checks

Use [RUNBOOK.md](./RUNBOOK.md) for:

- Production health checks.
- Telegram webhook inspection.
- Vercel logs.
- Admin endpoint checks.
- Rollback steps.
- Secret rotation steps.

## Next Optional Improvements

Current status: good enough for temporary personal use. The production bot,
database, webhook, and Git history are healthy, so the items below are backlog
work for the next development session.

Recommended priority:

1. Add GitHub Actions CI for automated tests and secret scanning on every push.
2. Add automatic backup/export, for example a scheduled CSV export or a
   documented Supabase backup routine.
3. Add edit transaction by ID, so mistakes can be fixed without deleting and
   re-entering a transaction.
4. Add an automatic monthly report from the bot.

Other optional improvements:

- Import CSV backup.
- Better category analytics.
- Optional English bot mode in the future.
