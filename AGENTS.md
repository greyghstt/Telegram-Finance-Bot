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
- Do not let AI save unvalidated or ambiguous transactions.
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

## Relevant Skills And Plugins

Codex CLI should use skills and plugins intentionally. Load only the skills
needed for the current task, then keep the change focused.

Use these skills when relevant:

- `docs-workflow`: any Markdown, README, runbook, plan, or agent guide change.
- `javascript-typescript`: Node.js, ESM modules, parser, service, and test work.
- `backend-development`: API endpoints, webhook flow, service boundaries, and
  server-side behavior.
- `database-design`: schema changes, migrations, indexes, and data modeling.
- `supabase`: Supabase CLI, Postgres migrations, pgvector, RLS, and production
  database work.
- `security-compliance`: secrets, token handling, webhook hardening, access
  control, or public-repo readiness.
- `senior-devops`: deployment planning, rollback, CI, observability, and
  production readiness.
- `bug-triage`: regressions, failing tests, broken webhook, or production bugs.
- `code-reviewer`: review risky changes before deploy or before public release.

Use plugin-backed capabilities when relevant:

- Vercel plugin:
  - `vercel:vercel-cli` for `vercel.cmd` operations.
  - `vercel:env-vars` for Vercel environment variable changes.
  - `vercel:vercel-functions` for webhook/function runtime behavior.
  - `vercel:deployments-cicd` for preview and production deployment flow.
  - `vercel:observability` for logs and runtime checks.
- GitHub plugin:
  - `github:github` for repository orientation and metadata.
  - `github:yeet` only when publishing a branch or PR is explicitly needed.
  - `github:gh-fix-ci` when GitHub Actions checks fail.
- Build Web Apps plugin:
  - `build-web-apps:supabase-postgres-best-practices` for Postgres query and
    schema review.

When adding SumoPod AI, preferred skill order:

1. `security-compliance` for key/env handling and logging rules.
2. `backend-development` plus `javascript-typescript` for the service design.
3. `docs-workflow` for README, plan, runbook, and `.env.example`.
4. `senior-devops` plus Vercel plugin skills for env and deploy steps.

## Commit Strategy

Prefer small, meaningful commits. The goal is a useful GitHub history, not one
large "everything changed" commit.

Rules:

- Commit after each coherent unit of work.
- Keep each commit reviewable, ideally one feature slice or one concern.
- Do not mix docs, dependency installation, parser changes, database changes,
  and deployment changes in one commit unless the change is tiny.
- Run the relevant tests before each code commit.
- Run a secret scan before commits that touch env, AI, Telegram, Vercel, or
  Supabase code.
- It is okay to have many commits when each commit tells a clear story.
- Do not create fake/no-op commits just to increase commit count.

Suggested AI integration commit slices:

1. `docs: plan AI integration`
   - `docs/PROJECT_PLAN.md`
   - `AGENTS.md`
   - `README.md` if needed
2. `chore: add AI configuration placeholders`
   - `.env.example`
   - config helpers if needed
3. `chore: install OpenAI-compatible SDK`
   - `package.json`
   - `package-lock.json`
4. `feat: add AI service foundation`
   - `src/ai-service.js`
   - focused tests
5. `feat: add insight command parser`
   - `src/parser.js`
   - parser tests
6. `feat: add AI insight response`
   - `src/message-handler.js`
   - message handler tests
7. `feat: expose insight in Telegram menu`
   - `src/telegram-service.js`
   - `scripts/setup-telegram-webhook.js`
   - Telegram service tests
8. `docs: document AI setup and operations`
   - `README.md`
   - `docs/RUNBOOK.md`
   - `docs/LOCAL_TESTING.md` if needed
9. `deploy: enable AI insight environment`
   - only if environment/deploy metadata changes are committed

Suggested commit message style:

```text
docs: update agent guide
chore: add AI env placeholders
feat: add AI insight service
test: cover AI disabled fallback
fix: handle SumoPod timeout
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

## Input Direction

Current manual parser behavior still supports explicit signs:

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

Target direction:

- Leading `+` and `-` should become optional in a future parser update.
- Telegram income/expense buttons should be the preferred explicit type choice.
- Natural Indonesian input should be accepted for simple transactions.
- AI may auto-save a simple transaction only after app-side validation.
- Ambiguous transactions should ask the user to choose income, expense, or
  cancel.

The application validator remains the source of truth for saved transactions.

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
5. Natural input parser with validated auto-save.
6. Budget assistant.

AI must never:

- calculate financial truth from raw guesses
- invent amounts
- save unvalidated or ambiguous transactions
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
