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

Current direct transaction input still supports explicit signs for backward
compatibility:

- `+` for income.
- `-` for expense.

The manual parser and database are the source of truth. AI is an optional layer
for explanation, insight, and future draft extraction.

Long-term input direction: signs should stay supported for quick input, but
they should not be required after income/expense buttons and AI natural parsing
are improved.

## Core Principles

- Keep secrets in environment variables, never in Git.
- Keep the Telegram webhook server-side only.
- Keep Indonesian Telegram UX stable unless explicitly requested otherwise.
- Keep manual parsing deterministic for normal transaction input.
- Use Supabase Postgres in production.
- Use SQLite for local development and tests.
- Keep Vercel functions close to Supabase by using region `syd1`.
- Require confirmation for destructive actions.
- Validate AI-generated transaction drafts before saving them.
- Ask for confirmation only when AI output is ambiguous or risky.
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
  -> AI extracts structured transaction candidates
  -> App validates candidates
  -> Auto-save if simple and unambiguous
  -> Ask user only when ambiguous
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
23. SumoPod-compatible AI service foundation with safe fallback behavior.
24. Read-only `/insight` command for summarized finance insight.
25. Finance Q&A that explains code-calculated summaries.
26. Monthly budget commands with AI/manual suggestions.
27. Guardrailed AI natural transaction extraction.
28. Safe latency metrics for database work, AI calls, and total message
    handling.
29. Quick/deep AI profiles while keeping `MiniMax-M2.7-highspeed`.
30. AI category suggestions normalized to existing categories.
31. Custom category and category alias storage.
32. Category correction command that stores note aliases.
33. Improved ambiguous AI transaction clarification flow.
34. Edit transaction by ID.
35. Soft delete and undo for the latest deletion.
36. CSV backup and CSV import with dry-run support.
37. Global and multi-period budgets.

## Database

Production uses Supabase Postgres. Local development and tests can use SQLite.

Tables:

```text
transactions
chat_sessions
budgets
custom_categories
category_aliases
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
deleted_at
created_at
updated_at
```

`chat_sessions` stores:

```text
id
chat_id
pending_input_mode
pending_action
pending_payload
created_at
updated_at
```

`budgets` stores:

```text
id
chat_id
category
period
monthly_limit
created_at
updated_at
```

`custom_categories` stores:

```text
id
chat_id
category
label
created_at
updated_at
```

`category_aliases` stores:

```text
id
chat_id
alias
category
created_at
updated_at
```

Migrations:

```text
supabase/migrations/20260420075334_init_keuangan_schema.sql
supabase/migrations/20260420100000_add_chat_session_pending_action.sql
supabase/migrations/20260422235000_add_budgets.sql
supabase/migrations/20260423113000_add_custom_categories.sql
supabase/migrations/20260423143000_add_transaction_soft_delete.sql
supabase/migrations/20260423153000_expand_budget_periods.sql
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
/insight
/tanya bulan ini boros di mana?
/budget
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
insight
tanya bulan ini boros di mana?
budget
kategori baru kopi Kopi
alias kategori ngopi = kopi
koreksi kategori 12 food
edit 12 -20k bensin
budget minggu global 120k
cek budget minggu
cari bensin
hapus terakhir
undo
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
3. Later, extract natural-language transactions and auto-save when validated.

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
No fallback model is configured yet.
```

Decision rules:

- Use `MiniMax-M2.7-highspeed` for all AI assistant features.
- Do not add model comparison scripts until there is a specific need.

## AI Environment Variables

Local `.env` should contain real secrets:

```env
AI_ENABLED=true
AI_PROVIDER=sumopod
AI_API_KEY=your_sumopod_key
AI_BASE_URL=https://ai.sumopod.com/v1
AI_MODEL=MiniMax-M2.7-highspeed
AI_TEMPERATURE=0.2
AI_MAX_TOKENS=2500
AI_TIMEOUT_MS=25000
```

`.env.example` should contain safe placeholders only:

```env
AI_ENABLED=true
AI_PROVIDER=sumopod
AI_API_KEY=
AI_BASE_URL=https://ai.sumopod.com/v1
AI_MODEL=MiniMax-M2.7-highspeed
AI_TEMPERATURE=0.2
AI_MAX_TOKENS=2500
AI_TIMEOUT_MS=25000
```

## AI Implementation Phases

### Agentic Work Guidelines

This project is expected to be developed with Codex CLI in small agentic
passes. Use `AGENTS.md` as the operating guide for every implementation pass.

Relevant skills and plugins should be selected per task:

- Documentation changes should use `docs-workflow`.
- Node.js service and test changes should use `javascript-typescript`.
- Webhook/API changes should use `backend-development`.
- Supabase and schema work should use `supabase` and `database-design`.
- Secret handling should use `security-compliance`.
- Deployment and CI work should use `senior-devops` plus Vercel plugin skills.
- Repository and PR operations should use the GitHub plugin when needed.

Commit policy:

- Prefer small commits per coherent part.
- Do not wait until the entire AI feature is finished before committing.
- Do not mix unrelated concerns in one commit.
- Run the relevant checks before each code commit.
- Keep the GitHub history readable and naturally active.

Recommended commit sequence for the AI work:

1. Documentation and agent guide.
2. AI env placeholders.
3. AI SDK dependency.
4. AI service foundation.
5. Parser command for `insight`.
6. Message handler integration.
7. Telegram command/menu update.
8. Tests and fallback polish.
9. README/runbook updates.
10. Deployment and production verification notes.

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

### Phase 4: Finance Q&A

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

### Phase 5: AI Natural Input Drafts

Goal: allow free-form text to become saved transactions when the AI output is
simple, validated, and unambiguous.

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
  -> App validates draft
  -> Auto-save if type and amount are clear
  -> Ask user only if type, amount, or note is ambiguous
```

Rules:

- AI auto-save is allowed for simple validated transactions.
- Always re-validate AI draft output with app-side validation.
- Ask for confirmation when confidence is low or transaction type is unclear.
- Store pending confirmation in `chat_sessions`.
- Allow `/batal` to cancel.

Done when:

- AI free-form input can create and save simple transactions.
- Bad AI output is rejected safely.
- Ambiguous transactions ask for clarification instead of saving.

## Future Input Simplification

The current manual parser still relies on a leading `+` or `-` for direct text
transactions. That requirement should be removed because the bot already has
Telegram buttons for income and expense input modes.

Target behavior:

- `20k bensin` can be saved as expense when the user selected expense mode.
- `500k gaji` can be saved as income when the user selected income mode.
- Simple natural input can be parsed by AI and auto-saved after validation.
- Leading `+` and `-` remain supported for fast optional input.
- If transaction type is unclear, the bot asks the user to choose income or
  expense.

Implementation notes:

- Keep backward compatibility with `+` and `-`, but do not require them.
- Do not remove tests for signed inputs; add tests for unsigned mode inputs.
- Use pending input mode before AI when the user explicitly chose a type.
- Use AI only when deterministic parsing cannot confidently decide.

### Phase 6: Budget Assistant

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

- Keep `AI_MAX_TOKENS=2500` as the current fixed limit while SumoPod usage is
  affordable.
- Send summaries, not full transaction history.
- Limit recent transactions sent to AI.
- Prefer compact prompts and bounded reply formats over removing AI from the
  feature.
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

## Next Phase: AI-First Performance And Flexible Input

The next phase should improve response speed without reducing AI involvement.
The goal is not to remove AI from the flow. The goal is to make AI work in a
faster and more controlled way.

Principles:

- AI should remain involved in natural parsing, insight, Q&A, budget advice,
  and category suggestions.
- Simple deterministic work should still be validated by the app.
- The user should not feel blocked by slow AI when a quick answer is possible.
- Data sent to AI should be compact and purpose-built.
- Replies should stay plain text and concise for Telegram.

### Performance Strategy

Split AI usage into two profiles:

```text
Quick AI
  -> natural transaction extraction
  -> category suggestion
  -> small JSON output
  -> short timeout

Deep AI
  -> insight
  -> finance Q&A
  -> budget advice
  -> monthly/weekly reports
  -> richer explanation
```

Recommended behavior:

- Quick AI should use compact prompts and strict JSON.
- Deep AI may use larger summarized context.
- Do not send full transaction history unless strictly needed.
- Cache repeated summary/insight requests where safe.
- Measure AI latency, database latency, and total response latency.
- Keep MiniMax-M2.7-highspeed as the fixed model for now.

Current implementation:

- Quick AI uses the same fixed model with smaller token and timeout caps in
  code.
- Deep AI keeps the configured `AI_MAX_TOKENS=2500` and
  `AI_TIMEOUT_MS=25000` defaults.
- Safe performance logs are optional through `PERF_LOGS=1` and do not include
  message text, API keys, chat IDs, or transaction notes.

Suggested environment direction:

```env
AI_MODEL=MiniMax-M2.7-highspeed
AI_TEMPERATURE=0.2
AI_MAX_TOKENS=2500
AI_TIMEOUT_MS=25000
```

Future code may add separate timeout/token profiles, for example:

```text
AI_QUICK_TIMEOUT_MS=12000
AI_DEEP_TIMEOUT_MS=25000
AI_QUICK_MAX_TOKENS=700
AI_DEEP_MAX_TOKENS=2500
```

Only add these variables when the code actually uses them.

### Input Direction

Normal usage should not require `+` or `-`.

Target examples:

```text
/pengeluaran
20k bensin

/pemasukan
500k gaji

tadi beli bensin 20 ribu dan makan ayam 15 ribu
```

Rules:

- Keep `+` and `-` supported as legacy shortcuts.
- Do not promote `+` and `-` as required in help text.
- Prefer Telegram buttons and input modes for explicit type selection.
- Use AI only when deterministic parsing cannot confidently decide.
- If transaction type is ambiguous, ask the user to choose income or expense.

### AI Category Direction

Categories should become more flexible without letting AI create messy data.

Implemented behavior:

```text
ayam geprek dekat kampus -> food
praktikum elektronika -> education
oli motor -> transport
bayar kos -> housing
```

Rules:

- AI may suggest a category.
- The app must normalize AI suggestions to known categories when possible.
- Unknown suggestions should become `other` or ask the user before creating a
  custom category.
- User corrections are stored as category aliases when the note is usable.

Implemented category features:

1. AI category suggestion.
2. Custom categories.
3. Category aliases.
4. Category correction command.
5. Learning from user correction notes as aliases.

Future category features:

1. Merge category command.
2. Rename category command.
3. Better category analytics in reports and dashboard.

### Recommended Next Implementation Order

1. Apply and verify the category storage migration before production deploy.
2. Test category customization in Telegram after deployment.
3. Continue optimizing natural parser prompts and output size.
4. Add merge/rename category commands if needed.
5. Add AI weekly/monthly report after performance is stable.

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

1. Add performance instrumentation and response-time logging.
2. Add GitHub Actions CI for automated tests and secret scanning on every push.
3. Add an automatic monthly report from the bot.

AI backlog:

1. Add merge/rename category commands.
2. Add richer weekly/monthly reports.
3. Add budget editing shortcuts if needed.

Optional future improvements:

- Better category analytics.
- Optional English bot mode in the future.
