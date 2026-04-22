# AGENTS.md

This file is the operating guide for Codex CLI and other coding agents working
on Telegram Finance Bot.

## Project Summary

Telegram Finance Bot is a private Telegram bot for tracking income and expenses.
The repository and documentation are in English. The Telegram bot user-facing
commands, parser examples, and replies currently remain Indonesian.

Production:

- Vercel project: `telegram-finance-bot`
- Production URL: `https://keuangan-telegram.vercel.app`
- Webhook: `https://keuangan-telegram.vercel.app/api/telegram/webhook`
- Database: Supabase Postgres
- Local test database: SQLite

## Agent Goals

When working in this repository, optimize for:

- correctness of financial data
- secure secret handling
- deterministic parser behavior
- small and reviewable changes
- passing tests
- production safety

Do not optimize for cleverness if it makes transaction behavior less predictable.

## Non-Negotiable Rules

- Do not commit `.env` or real secrets.
- Do not print API keys, Telegram tokens, database URLs, or private chat IDs.
- Do not change Indonesian Telegram UX unless the user explicitly asks.
- Do not make AI auto-save transactions.
- Do not remove confirmation from destructive actions.
- Do not rewrite Git history unless the user explicitly asks.
- Do not deploy production unless tests pass or the user explicitly accepts the
  risk.

## Important Commands

Use Windows-friendly commands:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run test:local-chat
npm.cmd run dev
npm.cmd run telegram
npm.cmd run check:production
npm.cmd run setup:webhook
```

Production deployment:

```powershell
vercel.cmd deploy --prod --yes
```

## Repository Map

```text
api/telegram/webhook.js        Vercel Telegram webhook
src/parser.js                  Indonesian parser and command parser
src/message-handler.js         Core transaction and command handling
src/telegram-service.js        Telegram update handling and replies
src/database.js                SQLite/Postgres database adapter
src/security.js                Token and header helpers
src/server.js                  Local/API server
src/telegram-bot.js            Local polling bot
scripts/setup-telegram-webhook.js
scripts/check-production.js
scripts/local-chat-scenario.js
docs/PROJECT_PLAN.md
docs/LOCAL_TESTING.md
docs/RUNBOOK.md
supabase/migrations/
```

## Current Data Rules

Manual transactions must start with:

- `+` for income
- `-` for expense

Examples:

```text
-20k bensin
+500k gaji
1. -12k minimarket
2. -20k bensin
3. +100k refund
```

The manual parser is the source of truth for normal transactions.

## AI Integration Rules

The planned AI provider is SumoPod using an OpenAI-compatible API.

Default candidate model:

```text
MiniMax-M2.7-highspeed
```

Fallback candidates:

```text
GLM-4.7
GLM-5.1
GPT-5-nano
```

Expected AI env vars:

```env
AI_ENABLED=false
AI_PROVIDER=sumopod
AI_API_KEY=
AI_BASE_URL=https://ai.sumopod.com/v1
AI_MODEL=MiniMax-M2.7-highspeed
AI_TEMPERATURE=0.2
AI_MAX_TOKENS=500
AI_TIMEOUT_MS=15000
```

AI must be introduced in this order:

1. AI foundation and safe fallback.
2. Read-only `/insight`.
3. Model comparison.
4. Finance Q&A.
5. Natural input draft extraction with confirmation.
6. Budget assistant.

AI must never:

- calculate financial truth from raw guesses
- invent amounts
- save transactions without confirmation
- bypass the manual parser for final validation
- expose secrets in logs

For `/insight`, send summarized data only. Do not send full database dumps.

## Testing Requirements

For code changes, run:

```powershell
npm.cmd test
npm.cmd run test:local-chat
```

For production-affecting changes, also run:

```powershell
npm.cmd run check:production
```

If tests cannot be run, explain why in the final response.

## Security Checks

Before commits that touch env, AI, Telegram, Vercel, or Supabase code, run a
targeted scan:

```powershell
rg -n "s[k]-[A-Za-z0-9_-]{20,}|TELEGRAM_BOT_TOKEN=.*:A[A]|DATABASE_URL=postgresq[l]|postgresql://postgre[s]|13336512[5]7|85736275[6]8|AAE[f]" .
```

Expected result: no real secrets in tracked files.

## Coding Style

- Use ESM modules.
- Keep functions small and testable.
- Prefer existing patterns in `src/message-handler.js`, `src/parser.js`, and
  `src/telegram-service.js`.
- Add tests for parser, message handler, database behavior, and security logic
  when changing those areas.
- Keep comments short and useful.
- Avoid unrelated refactors.

## Documentation Rules

- Keep repository documentation in English.
- Keep Telegram examples in Indonesian while the bot UX remains Indonesian.
- Update `README.md` when user-facing setup changes.
- Update `docs/PROJECT_PLAN.md` when roadmap or architecture changes.
- Update `docs/RUNBOOK.md` when deployment or operations change.
- Keep `.env.example` safe and free from real values.

## Deployment Safety

Before production deploy:

1. Ensure working tree is clean or changes are intentional.
2. Run tests.
3. Confirm required Vercel env vars exist.
4. Deploy.
5. Run production check.
6. Test the relevant Telegram command manually.
7. Check provider usage if AI is involved.

Do not change the Telegram webhook URL away from
`https://keuangan-telegram.vercel.app/api/telegram/webhook` unless the new URL
is publicly reachable without Vercel Authentication.

## Done Criteria

A task is done when:

- implementation matches the request
- tests pass or skipped tests are explained
- secrets are not exposed
- docs are updated if behavior/setup changed
- production checks pass for deployment-related work
- final response states what changed and what remains
