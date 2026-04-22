# Project Plan: Telegram Finance Bot

This document keeps the project direction clear for human work and agentic
work with Codex CLI. Repository metadata and documentation are in English. The
live Telegram bot intentionally keeps Indonesian commands, parser examples, and
replies for now.

## Current Status

Telegram Finance Bot is stable enough for temporary personal use.

- Production URL: `https://keuangan-telegram.vercel.app`
- Webhook URL:
  `https://keuangan-telegram.vercel.app/api/telegram/webhook`
- GitHub repository: `https://github.com/greyghstt/Telegram-Finance-Bot`
- Vercel project: `telegram-finance-bot`
- Database: Supabase Postgres in Oceania/Sydney
- Vercel function region: `syd1`

The public production domain still uses `keuangan-telegram.vercel.app` because
the shorter English `telegram-finance-bot.vercel.app` alias is not available,
and generated Vercel aliases are protected by Vercel Authentication.

## Product Goal

Build a private Telegram bot for tracking income and expenses through chat.

Core examples:

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

The manual parser and database are the source of truth. AI is an optional layer
for explanation, insight, and future draft extraction.

## Core Principles

- Keep secrets in environment variables, never in Git.
- Keep the Telegram webhook server-side only.
- Keep Indonesian Telegram UX stable unless explicitly requested otherwise.
- Keep manual parsing deterministic for normal transaction input.
- Use Supabase Postgres in production.
- Use SQLite for local development and tests.
- Keep Vercel functions close to Supabase by using region `syd1`.
- Require confirmation for destructive actions.
- Require confirmation before saving AI-generated transaction drafts.
- Run checks before deployment.
- Prefer small, reversible changes.

## Current Architecture

Production:

```text
Telegram
  -> Vercel webhook
  -> Telegram service
  -> Message handler
  -> Supabase Postgres
```

Local development:

```text
Local Telegram polling bot
  -> Telegram service
  -> Message handler
  -> SQLite
```

Future AI insight path:

```text
Telegram command /insight
  -> Message handler
  -> Database summary
  -> AI service via SumoPod
  -> Indonesian insight reply
```

Future AI natural input path:

```text
Free-form user text
  -> Manual parser fails or AI mode is selected
  -> AI extracts draft transactions
  -> Bot asks for confirmation
  -> User confirms
  -> Database save
```

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
22. English repository and documentation naming.

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

The migration filenames keep their original names to preserve migration
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
- AI API keys must never appear in source code, docs, screenshots, or commits.

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

## AI Integration Goal

Add an optional AI layer using SumoPod's OpenAI-compatible API. The first AI
feature should be `/insight`, because it is read-only and does not mutate
financial data.

Initial AI use cases:

1. Generate spending insight from database summaries.
2. Answer finance questions using code-calculated summaries.
3. Later, extract draft transactions from natural language with confirmation.

AI must not become the source of truth for amounts. Amounts should be computed
by the application and database.

## AI Provider Plan

Provider:

```text
SumoPod OpenAI-compatible API
```

Base URL:

```text
https://ai.sumopod.com/v1
```

Initial model choice:

```text
MiniMax-M2.7-highspeed
```

Reasoning:

- Good price-to-performance based on the current SumoPod pricing table.
- Suitable for short Indonesian insight replies.
- Good first candidate for experimentation with small budget limits.

Fallback candidates:

```text
GLM-4.7
GLM-5.1
GPT-5-nano
```

Decision rules:

- Use `MiniMax-M2.7-highspeed` first for `/insight`.
- Test `GLM-4.7`, `GLM-5.1`, and `GPT-5-nano` with the same prompts.
- Choose the best default based on Indonesian quality, JSON consistency,
  latency, and real cost.
- Keep `GPT-5-nano` as a stable fallback candidate if discount pricing changes.

## AI Environment Variables

Local `.env` should contain real secrets:

```env
AI_ENABLED=true
AI_PROVIDER=sumopod
AI_API_KEY=your_sumopod_key
AI_BASE_URL=https://ai.sumopod.com/v1
AI_MODEL=MiniMax-M2.7-highspeed
AI_TEMPERATURE=0.2
AI_MAX_TOKENS=500
AI_TIMEOUT_MS=15000
```

`.env.example` should contain safe placeholders only:

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

## AI Implementation Phases

### Phase 1: AI Foundation

Goal: add AI infrastructure without changing bot behavior.

Tasks:

1. Add `openai` dependency.
2. Add AI env placeholders to `.env.example`.
3. Create `src/ai-service.js`.
4. Implement AI client creation with `AI_API_KEY` and `AI_BASE_URL`.
5. Implement `isAiEnabled()`.
6. Implement timeout and safe error handling.
7. Add unit tests for AI disabled and AI error fallback behavior.

Done when:

- Tests pass with `AI_ENABLED=false`.
- The app does not require an AI key to run.
- No AI secret appears in committed files.

### Phase 2: Read-Only `/insight`

Goal: add the first useful AI feature without database mutation.

Tasks:

1. Add parser command aliases:

   ```text
   insight
   ai insight
   analisis
   analisa
   ```

2. Add Telegram command:

   ```text
   /insight
   ```

3. Build an insight data object from database summaries:
   - current balance
   - total income
   - total expense
   - transaction count
   - category summary
   - recent transactions
   - period label

4. Send only summarized data to AI.
5. Require Indonesian output.
6. Instruct AI to never invent amounts.
7. Add fallback manual summary when AI is disabled or fails.

Done when:

- `insight` works locally without AI key using fallback.
- `insight` works locally with SumoPod key.
- The reply is short, Indonesian, and does not invent amounts.
- Existing manual commands still pass tests.

### Phase 3: Vercel Deployment

Goal: enable `/insight` in production safely.

Tasks:

1. Add AI env vars to Vercel:

   ```text
   AI_ENABLED
   AI_PROVIDER
   AI_API_KEY
   AI_BASE_URL
   AI_MODEL
   AI_TEMPERATURE
   AI_MAX_TOKENS
   AI_TIMEOUT_MS
   ```

2. Deploy preview.
3. Test `/insight` from Telegram.
4. Check SumoPod usage.
5. Check Vercel logs.
6. Deploy production only after preview works.

Done when:

- Production health check passes.
- Telegram webhook has no pending updates and no last error.
- `/insight` returns useful output.
- SumoPod spending remains within budget.

### Phase 4: Model Comparison

Goal: pick the best model using real prompts and real costs.

Test candidates:

```text
MiniMax-M2.7-highspeed
GLM-4.7
GLM-5.1
GPT-5-nano
```

Evaluation prompts:

1. Small month with only a few transactions.
2. Month with high food spending.
3. Month with transport spike.
4. Month with low data quality.
5. Indonesian finance question.
6. Structured JSON draft extraction sample.

Score each model on:

- Indonesian clarity.
- Follows "do not invent amounts".
- Conciseness.
- Latency.
- Cost.
- JSON consistency for future parser work.

Done when:

- Default model is documented.
- Fallback model is documented.
- Prompt examples are saved in docs or tests.

### Phase 5: Finance Q&A

Goal: answer natural finance questions without letting AI calculate raw
database truth by itself.

Example questions:

```text
bulan ini paling boros apa?
berapa total bensin bulan ini?
kenapa bulan ini terasa boros?
```

Rules:

- Code must compute key numbers.
- AI may explain the computed summary.
- AI may not query the database directly.
- AI may not claim certainty beyond available data.

Done when:

- Common questions get useful answers.
- Unknown questions get a safe fallback.
- Responses remain short enough for Telegram.

### Phase 6: AI Natural Input Drafts

Goal: allow free-form text to become draft transactions, but never auto-save.

Example:

```text
tadi beli bensin 20 ribu, makan 15 ribu, refund teman 50 ribu
```

AI draft:

```text
1. -20k bensin
2. -15k makan
3. +50k refund teman
```

Required flow:

```text
AI extracts draft
  -> Bot displays draft
  -> Bot asks for confirmation
  -> User confirms
  -> Manual parser validates draft
  -> Database save
```

Rules:

- Never save AI drafts automatically.
- Always re-validate AI draft output with the manual parser.
- Store pending confirmation in `chat_sessions`.
- Allow `/batal` to cancel.

Done when:

- AI free-form input can create draft transactions.
- Bad AI output is rejected safely.
- No transaction is saved without user confirmation.

### Phase 7: Budget Assistant

Goal: add optional budget tracking and AI-supported advice.

Potential table:

```text
budgets
```

Potential commands:

```text
budget food 700k
budget transport 300k
cek budget
```

Rules:

- Budget numbers are stored and calculated by code.
- AI can explain and suggest, but not mutate budget without confirmation.

## AI Prompt Rules

Every finance insight prompt should include these constraints:

- Reply in Indonesian.
- Use only the provided data.
- Do not invent amounts, dates, or categories.
- If data is limited, say that the insight is still weak.
- Keep the reply concise for Telegram.
- Avoid financial advice that sounds absolute.
- Provide practical suggestions, not guarantees.

## AI Cost Control

- Keep `AI_MAX_TOKENS` low at first.
- Send summaries, not full transaction history.
- Limit recent transactions sent to AI.
- Use SumoPod budget limits.
- Monitor usage after every production test.
- Disable AI with `AI_ENABLED=false` if cost or quality is not acceptable.

## AI Failure Handling

AI calls may fail because of:

- missing API key
- provider outage
- timeout
- exhausted balance
- invalid model name
- malformed provider response

Required behavior:

- Bot must not crash.
- Bot must return a manual fallback summary.
- Logs must not print API keys.
- Existing non-AI commands must continue working.

## Verification Commands

Run before committing code changes:

```powershell
npm.cmd test
npm.cmd run test:local-chat
```

Run before and after production deployment:

```powershell
npm.cmd run check:production
```

Run secret scans before publishing or pushing sensitive changes:

```powershell
rg -n "s[k]-[A-Za-z0-9_-]{20,}|TELEGRAM_BOT_TOKEN=.*:A[A]|DATABASE_URL=postgresq[l]|postgresql://postgre[s]|13336512[5]7|85736275[6]8|AAE[f]" .
```

## Backlog Priorities

Current non-AI backlog:

1. Add GitHub Actions CI for automated tests and secret scanning on every push.
2. Add automatic backup/export, for example a scheduled CSV export or a
   documented Supabase backup routine.
3. Add edit transaction by ID, so mistakes can be fixed without deleting and
   re-entering a transaction.
4. Add an automatic monthly report from the bot.

AI backlog:

1. Add SumoPod AI foundation.
2. Add read-only `/insight`.
3. Compare SumoPod model candidates.
4. Add finance Q&A.
5. Add AI natural input drafts with confirmation.
6. Add budget assistant.

Optional future improvements:

- Import CSV backup.
- Better category analytics.
- Optional English bot mode in the future.
