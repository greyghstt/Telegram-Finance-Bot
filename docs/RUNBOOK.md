# Operations Runbook

Use this short runbook when the bot is slow, does not reply, or needs a
post-deploy health check.

## Quick Check

Run from the project folder:

```powershell
npm.cmd run check:production
```

It checks:

- Production `/health`.
- `/database/status` with `ADMIN_API_TOKEN`.
- Telegram `getWebhookInfo` plus a signed webhook probe when
  `TELEGRAM_WEBHOOK_SECRET` is available locally.

Healthy output should look like:

```text
OK health - 200 ...
OK database/status - 200 ...
OK telegram webhook - ... pending=0 ... probe=status_200
```

## Check Telegram Webhook

```powershell
node -e "import('dotenv/config').then(async()=>{const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/getWebhookInfo'); console.log(await r.text())})"
```

Look for:

- `url` should be
  `https://keuangan-telegram.vercel.app/api/telegram/webhook`.
- `pending_update_count` should be small or `0`.
- `last_error_message` may lag behind after recovery. Treat it as historical
  only if `pending_update_count=0` and the signed webhook probe returns `200`.

If the bot has just recovered from a webhook incident, run:

```powershell
node scripts/check-production.js
```

with local `.env` available so the script can perform the signed probe.

## Incident Note: Schema Drift

One production incident was caused by Postgres schema drift where additive
columns existed in code but were missing in production tables:

- `transactions.deleted_at`
- `chat_sessions.pending_payload`

Symptom pattern:

- `/health` stayed healthy
- `/database/status` failed or timed out
- Telegram webhook returned `500`

Fix applied:

- runtime Postgres initialization now runs whenever `DATABASE_URL` is present,
  including on Vercel, so additive schema changes are healed with idempotent
  `create table if not exists` and `add column if not exists` steps.

## Check Vercel Logs

```powershell
vercel.cmd logs https://keuangan-telegram.vercel.app
```

Use this when Telegram does not reply or an endpoint returns 500.

## Check Admin Endpoint

```powershell
Invoke-RestMethod `
  -Uri "https://keuangan-telegram.vercel.app/database/status" `
  -Headers @{"x-admin-api-token"=$env:ADMIN_API_TOKEN}
```

If it returns `401`, check the local or Vercel `ADMIN_API_TOKEN`.

## Troubleshoot AI Insight

AI features include `/insight`, `tanya ...`, `saran budget`, and natural
transaction extraction. Weekly/monthly AI reports and anomaly checks use the
same guardrail pattern. Existing non-AI commands should continue to work when
AI is disabled, the key is missing, or SumoPod is unavailable.

Local checks:

```powershell
npm.cmd test
npm.cmd run test:local-chat
npm.cmd run scan:secrets
```

Configuration checks:

- `AI_ENABLED=false` should use the manual fallback.
- `AI_ENABLED=true` also requires `AI_API_KEY`.
- `AI_BASE_URL` should normally be `https://ai.sumopod.com/v1`.
- `AI_MODEL` should start as `MiniMax-M2.7-highspeed`.
- `AI_MAX_TOKENS` should be `2500`.
- `AI_TIMEOUT_MS` should be `25000`.
- `PERF_LOGS=1` enables safe JSON performance logs. Leave it `0` unless you
  are actively investigating latency.
- Never print or paste `AI_API_KEY` in logs, screenshots, issues, or commits.
- `npm.cmd run report:weekly`, `npm.cmd run report:monthly`, and
  `npm.cmd run report:anomalies` should produce read-only summaries even when
  AI falls back.

If `/insight` returns only the manual fallback while AI should be active, check
for a missing key, provider timeout, exhausted provider balance, or invalid
model name. Existing non-AI commands should continue to work.

AI replies are sent to Telegram as plain text. The app renders the key numbers
it computed first, then strips common Markdown markers from AI explanations. If
the output still looks malformed, check the prompt in `src/ai-service.js` and
the reply builders in `src/message-handler.js` before changing Telegram
`parse_mode`.

## Check AI Performance

The next optimization phase should keep AI involvement high while making the
bot feel faster. When investigating slow replies, separate these timings:

- database query time
- AI request time
- total Telegram response time

Healthy direction:

- normal deterministic commands should stay fast
- quick AI extraction uses compact prompts, small JSON output, and smaller
  code-level timeout/token caps
- deep AI analysis may take longer but should still return within the configured
  timeout
- repeated insight-style requests may be cached later if the data has not
  changed

Do not fix slow responses by simply removing AI from the product direction.
Prefer prompt compaction, smaller AI payloads, profile-specific timeouts, and
better fallback behavior.

The current quick/deep split uses code-level caps and the same fixed
`MiniMax-M2.7-highspeed` model. Do not add separate quick/deep env vars until
the code needs them.

## Category Quality Checks

Category improvements use AI suggestions with app-side normalization and
per-chat category rules.

Check that:

- AI category suggestions map to known categories when possible.
- Unknown category suggestions do not create messy production data silently.
- Current unknown suggestions become `other` unless the transaction is income,
  where `income` remains the normalized category.
- Custom categories are created only through explicit user commands such as
  `kategori baru kopi Kopi` or through explicit correction targets.
- Stored aliases such as `alias kategori ngopi = kopi` are scoped to the
  Telegram chat.
- `koreksi kategori 12 kopi` updates only that transaction and stores the note
  as an alias when it is usable.
- Ambiguous AI transaction candidates should wait for `pemasukan`,
  `pengeluaran`, or `/batal` before saving anything.
- Reports display friendly category labels, not raw technical labels, whenever
  possible.

If `/database/status` fails after deploying category code, check whether the
latest Supabase migration has been applied:

```text
supabase/migrations/20260423113000_add_custom_categories.sql
supabase/migrations/20260423143000_add_transaction_soft_delete.sql
supabase/migrations/20260423170000_add_wallets_recurring_and_bills.sql
```

## Transaction Correction Checks

Check that:

- `edit 12 -20k bensin` updates only transaction `#12`.
- `hapus terakhir` and `hapus 12` remove the row from normal reports without
  physically deleting it.
- `undo` restores only the latest deleted transaction for the same chat.
- Summary, search, history, and category reports ignore `deleted_at` rows.

## Backup And Import Checks

Check that:

- `npm.cmd run backup:csv` writes a timestamped file under `backups/`.
- `npm.cmd run import:csv -- <file>` stays in dry-run mode by default.
- `npm.cmd run import:csv -- <file> --apply` only runs after the dry run looks
  correct.
- `GET /backup/csv` and `POST /import/csv` require `ADMIN_API_TOKEN`.
- CSV import accepts the repo export format and rejects missing required
  headers.

For imports, prefer dry run first so accidental duplicate financial rows are
caught before writing data.

## Budget Checks

Check that:

- `budget food 700k` still means monthly.
- `budget minggu global 120k` and `cek budget minggu` use the current week.
- `budget tahun transport 6jt` uses the current year.
- `global` budget compares against total expenses for that period, not one
  category only.

## Wallet, Recurring, And Bill Checks

Check that:

- `dompet tambah cash` and `dompet tambah bca` create per-chat wallet records.
- wallet-tagged transactions such as `-20k bensin dompet cash` affect wallet
  balance and still count in the normal expense summary.
- `transfer bca cash 50k` changes wallet balances only and does not add new
  income or expense.
- `transaksi rutin tambah bulanan -500k kos kategori housing` stores a rule but
  does not write a transaction until the processor runs.
- `npm.cmd run process:recurring` should skip invalid templates and advance the
  next run only after saving valid transactions.
- `tagihan tambah wifi 250k tiap 15 kategori bills` stores a per-chat reminder.
- `tagihan hari ini` only shows due reminders for the current Telegram chat.
- `npm.cmd run process:bills` lists due reminders without exposing notes,
  secrets, or unrelated chat context.

## AI Report And Anomaly Checks

Check that:

- `laporan ai minggu ini` starts with app-calculated weekly summary lines.
- `review ai bulan ini` includes budget and wallet context only when available.
- `cek anomali` lists only app-calculated anomaly candidates, not AI guesses.
- AI replies stay plain text and compact for Telegram.
- manual fallback still returns useful output when AI is disabled, the key is
  missing, or the provider times out.

## Vercel AI Environment

Required AI variables for both Preview and Production:

```text
AI_ENABLED=true
AI_PROVIDER=sumopod
AI_API_KEY=<set in Vercel only>
AI_BASE_URL=https://ai.sumopod.com/v1
AI_MODEL=MiniMax-M2.7-highspeed
AI_TEMPERATURE=0.2
AI_MAX_TOKENS=2500
AI_TIMEOUT_MS=25000
```

Use Vercel CLI only if the value can be passed without printing secrets. If
the CLI prompt would expose `AI_API_KEY`, set it manually in the Vercel
Dashboard instead.

## CI Checks

GitHub Actions runs on pushes to `main` and on pull requests. The workflow:

- installs dependencies with `npm ci`
- runs `npm test`
- runs `npm run test:local-chat`
- runs `npm run scan:secrets`

If CI fails on the secret scan, inspect the reported file and line before
retrying. Do not suppress the rule by committing the secret.

## Telegram Command Surface

The current Telegram command menu includes:

- `/insight`, `/tanya`, `/laporanai`, `/reviewai`, `/anomali`
- `/budget`, `/dompet`, `/tagihan`
- `/pemasukan`, `/pengeluaran`, `/saldo`, `/hariini`, `/mingguini`,
  `/bulanini`, `/riwayat`, `/kategori`, `/hapusterakhir`, `/undo`, `/export`,
  `/reset`, `/help`, `/batal`, `/id`, `/stop`

Text commands still cover some operational flows such as `transfer ...`,
`transaksi rutin ...`, `hapus rutin ...`, and `tagihan tambah ...`.

## Deploy and Rollback

Production deploy:

```powershell
vercel.cmd deploy --prod --yes
```

Rollback from Vercel Dashboard:

1. Open the `telegram-finance-bot` project.
2. Go to Deployments.
3. Select the latest healthy deployment.
4. Promote or roll back to that deployment.

## After Secret Changes

If you change `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`ADMIN_API_TOKEN`, or `DATABASE_URL`:

1. Update local `.env`.
2. Update Vercel environment variables.
3. Redeploy.
4. Reset the Telegram webhook:

```powershell
$env:TELEGRAM_WEBHOOK_URL="https://keuangan-telegram.vercel.app/api/telegram/webhook"
npm.cmd run setup:webhook
```

5. Run:

```powershell
npm.cmd run check:production
```
