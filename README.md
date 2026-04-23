# Telegram Finance Bot

A private Telegram bot for tracking income and expenses through chat.

The repository and documentation are in English. The Telegram bot itself still
uses Indonesian commands, parser examples, and replies because that is the
current target usage.

## Status

The project is live:

- Production: `https://keuangan-telegram.vercel.app`
- Webhook: `https://keuangan-telegram.vercel.app/api/telegram/webhook`
- Runtime: Vercel Functions in `syd1`
- Database: Supabase Postgres
- Repository: `https://github.com/greyghstt/Telegram-Finance-Bot`

Main features:

- Record transactions from Telegram income/expense input modes.
- Leading `+` or `-` signs are still supported for quick manual input.
- Balance, daily, weekly, monthly, and yearly reports.
- Transaction history with IDs and WIB timestamps.
- Delete the latest transaction or delete by ID.
- Edit transactions by ID.
- Soft-delete transaction removal with `undo` for the latest deletion.
- Search transactions.
- Category summary.
- Custom categories, stored category aliases, and category correction commands.
- AI `/insight`, finance Q&A, budget suggestions, and natural transaction
  extraction through SumoPod with compact plain-text replies and manual
  fallbacks.
- Monthly budgets per Telegram chat.
- CSV backup and CSV import tooling with dry-run support.
- Global and multi-period budgets: weekly, monthly, and yearly.
- Wallet tracking and wallet-to-wallet transfers.
- Recurring transaction rules and bill reminder storage.
- AI weekly report, monthly review, and anomaly checks with manual fallback.
- Export CSV as a Telegram document.
- Reset all transactions with `YA RESET` confirmation.
- Telegram webhook protected by `TELEGRAM_WEBHOOK_SECRET`.
- Admin endpoints protected by `ADMIN_API_TOKEN`.

## Project Structure

```text
Telegram-Finance-Bot/
  AGENTS.md
  api/telegram/webhook.js
  docs/
    LOCAL_TESTING.md
    PROJECT_PLAN.md
    RUNBOOK.md
  scripts/
    backup-csv.js
    check-production.js
    ensure-local-secrets.js
    import-csv.js
    local-chat-scenario.js
    process-anomalies.js
    process-bill-reminders.js
    process-monthly-review.js
    process-recurring.js
    process-weekly-report.js
    secret-scan.js
    setup-telegram-webhook.js
  src/
    ai-service.js
    database.js
    message-handler.js
    parser.js
    security.js
    server.js
    telegram-bot.js
    telegram-service.js
  supabase/migrations/
  vercel.json
```

## Environment

Create `.env` from `.env.example`, then put real secrets only in `.env`.

```env
PORT=3000
DATABASE_PATH=data/telegram-finance-bot.sqlite
DATABASE_URL=
TELEGRAM_BOT_TOKEN=your_new_botfather_token
TELEGRAM_ALLOWED_CHAT_IDS=123456789
TELEGRAM_WEBHOOK_URL=
TELEGRAM_WEBHOOK_SECRET=
ADMIN_API_TOKEN=
AI_ENABLED=true
AI_PROVIDER=sumopod
AI_API_KEY=
AI_BASE_URL=https://ai.sumopod.com/v1
AI_MODEL=MiniMax-M2.7-highspeed
AI_TEMPERATURE=0.2
AI_MAX_TOKENS=2500
AI_TIMEOUT_MS=25000
PERF_LOGS=0
```

Notes:

- `.env` contains real secrets and must not be committed.
- `.env.example` is a safe template and must not contain real tokens,
  passwords, or private chat IDs.
- If a Supabase password was ever committed, reset it in Supabase Dashboard and
  update `DATABASE_URL`.
- AI is optional at runtime. Leave `AI_ENABLED=false` to use manual fallbacks.
- To use SumoPod, set `AI_ENABLED=true` and put the real SumoPod key only in
  local `.env` or Vercel environment variables. Never commit or paste the key.
- The fixed model target is `MiniMax-M2.7-highspeed`.
- Set `PERF_LOGS=1` only when you need safe latency logs. Logs include command
  kind and timing metrics, not message text or secrets.

## Local Development

```powershell
npm.cmd install
npm.cmd run dev
```

Check:

```text
http://localhost:3000/health
```

Local Telegram polling mode:

```powershell
npm.cmd run telegram
```

## Tests

```powershell
npm.cmd test
npm.cmd run test:local-chat
npm.cmd run scan:secrets
```

Production check:

```powershell
npm.cmd run check:production
```

Operational notes are in [docs/RUNBOOK.md](./docs/RUNBOOK.md).

GitHub Actions runs `npm ci`, `npm test`, `npm run test:local-chat`, and
`npm run scan:secrets` on pushes to `main` and on pull requests.

Operational note: production Postgres now runs the idempotent schema
initialization path at runtime whenever `DATABASE_URL` is present. This keeps
additive columns such as soft-delete and session payload fields from drifting
behind the deployed code on Vercel.

## Transaction Format

The recommended flow is to choose an input mode first:

- `/pemasukan`, then send the amount and note.
- `/pengeluaran`, then send the amount and note.

Leading signs are still supported for quick manual input:

- `+` for income.
- `-` for expense.

Examples with explicit signs:

```text
-20k bensin
-12rb makan
-Rp35.000 bayar makan
+500k gaji
+masuk 1,5jt freelance
-makan ayam 27rb via qris kemarin #kantin
-Rp125.000 buku kategori education 16/04/2026
```

Batch transactions:

```text
1. -12k minimarket
2. -20k bensin
3. +100k refund
```

Examples after selecting an input mode:

```text
20k bensin
12rb makan
500k gaji
makan ayam 27rb via qris kemarin #kantin
```

Supported amount examples:

- `20k`, `20rb`, `20r`, `20 rebu`
- `20.000`, `20,000`
- `1,5jt`, `2.5 juta`
- `Rp1.250.000`

Supported metadata:

- Auto categories: food, transport, groceries, bills, health, education,
  shopping, entertainment, housing, family, donation, debt, income, other.
- Explicit category: `kategori education`, `category food`, `cat transport`.
- Payment method: cash, qris, debit, credit card, bank transfer, e-wallet.
- Date hints: `hari ini`, `kemarin`, `besok`, `16/04/2026`, `2026-04-16`,
  `16 apr`.
- Tags: `#kantin`, `#kampus`.

## Telegram Commands

The Telegram commands remain Indonesian for now:

```text
/start
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
/laporanai
/reviewai
/anomali
/budget
/dompet
/tagihan
/cari bensin
/hapusterakhir
/undo
/export
/reset
/help
/batal
/id
/stop
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
laporan ai minggu ini
review ai bulan ini
cek anomali
budget
cek budget
budget food 700k
budget minggu global 120k
cek budget minggu
budget tahun food 12jt
saran budget
dompet
tagihan
dompet tambah cash
transfer bca cash 50k
transaksi rutin tambah bulanan -500k kos kategori housing
transaksi rutin
hapus rutin 2
tagihan tambah wifi 250k tiap 15 kategori bills
tagihan
tagihan hari ini
hapus tagihan 3
kategori baru kopi Kopi
alias kategori ngopi = kopi
koreksi kategori 12 food
edit 12 -20k bensin
cari bensin
hapus terakhir
undo
hapus 12
export csv
reset
help
```

The Telegram command menu currently exposes `/laporanai`, `/reviewai`,
`/anomali`, `/dompet`, and `/tagihan` in addition to the older finance
commands. Some operational actions such as `transfer ...`, `transaksi rutin ...`,
and `tagihan tambah ...` remain text commands rather than dedicated slash
commands.

Input modes:

- `/pemasukan`, then the next message can be `500k gaji`.
- `/pengeluaran`, then the next message can be `20k bensin` or `beli bensin 20k`.
- `/batal` cancels the active input mode.

Deterministic input routing now prefers manual handling before AI:

- explicit commands and slash commands
- manual transaction parsing, including amount-first and note-first variants
- wallet and transfer intents such as `dompet tambah cash`, `saldo dompet`,
  `transfer dari bca ke cash 50k`, and `pindah 50k dari cash ke bca`
- wallet-oriented income phrases such as `topup gopay 100k`,
  `isi saldo 150k ke dana`, `saldo awal cash 200k`, and
  `masuk ke bca 500k gaji`

If a wallet or transfer message is incomplete, the bot returns a deterministic
format hint instead of sending the text to AI.

Read-only AI insight:

```text
/insight
insight
ai insight
analisis
analisa
```

The command sends only summarized finance data to AI: balance, income, expense,
transaction count, top categories, and a few recent transactions. If AI is
disabled or unavailable, the bot replies with a manual Indonesian summary.

Finance Q&A:

```text
/tanya bulan ini boros di mana?
tanya berapa total bensin bulan ini?
tanya kenapa pengeluaran food tinggi?
```

The app computes the key numbers from the database first. AI only explains the
computed summary and must not invent amounts. Telegram replies are rendered as
plain text; the app strips Markdown-like formatting from AI output before
sending it.

Budget commands:

```text
budget
cek budget
budget food 700k
budget global 3jt
budget minggu global 120k
budget bulan food 700k
budget tahun transport 6jt
cek budget minggu
cek budget tahun
budget transport 300k
hapus budget food
reset budget
saran budget
```

Budgets are stored per Telegram chat and support `minggu`, `bulan`, and
`tahun`. `budget food 700k` still means monthly by default. Use `global` to
limit the total expense across all categories for a period. Resetting all
budgets from Telegram requires `YA RESET BUDGET` confirmation.

CSV backup and import:

```powershell
npm.cmd run backup:csv
npm.cmd run import:csv -- .\backups\telegram-finance-bot-2026-04-23T11-10-00.000Z.csv
npm.cmd run import:csv -- .\backups\telegram-finance-bot-2026-04-23T11-10-00.000Z.csv --apply
```

The import script runs as a dry run by default and only writes when `--apply`
is passed. Admin endpoints also support:

```text
GET /backup/csv
POST /import/csv
```

`POST /import/csv` expects JSON with `csv` and optional `dryRun`.

Wallets, transfers, and scheduled records:

```text
dompet tambah cash
buat dompet bca
dompet tambah bca
saldo dompet
dompet
transfer bca cash 50k tarik tunai
transfer dari bca ke cash 50k tarik tunai
pindah 50k dari cash ke bca
topup gopay 100k
isi saldo 150k ke dana
saldo awal cash 200k
masuk ke bca 500k gaji
-20k bensin dompet cash
transaksi rutin tambah bulanan -500k kos kategori housing
transaksi rutin
hapus rutin 2
tagihan tambah wifi 250k tiap 15 kategori bills
tagihan
tagihan hari ini
hapus tagihan 3
```

Wallet balances combine wallet-tagged income and expense transactions with
wallet-to-wallet transfers. Transfers are stored separately so they do not
inflate income or expense summaries. Due bill reminder checks are scoped to the
active Telegram chat.

AI report automation:

```powershell
npm.cmd run report:weekly
npm.cmd run report:monthly
npm.cmd run report:anomalies
```

These scripts generate the same read-only AI summaries used by Telegram. They
use app-calculated summaries first, then ask AI to explain those numbers. If AI
is disabled or unavailable, the scripts still return a manual fallback summary.

Natural input:

```text
tadi beli bensin 20 ribu dan makan ayam 15 ribu
refund teman 50 ribu
gaji freelance masuk 1,5 juta
```

AI may extract transaction candidates, but the app validates every candidate
before saving. Ambiguous input asks the user to reply `pemasukan`,
`pengeluaran`, or `/batal`; nothing is saved before that clarification. Natural
extraction uses the quick AI path with compact JSON output.
Wallet creation, wallet balance phrases, transfers, and explicit input-mode
messages are routed through deterministic parsing first so AI is not used for
cases that can already be handled safely by rules.
AI may suggest a category, but the app normalizes it to existing categories
such as `food`, `education`, `transport`, or `housing`; unknown suggestions
fall back to `other`.

Category management:

```text
kategori baru kopi Kopi
alias kategori ngopi = kopi
koreksi kategori 12 kopi
```

Custom categories and aliases are stored per Telegram chat. Corrections update
the selected transaction and store the transaction note as an alias for the new
category, so future AI category suggestions can normalize similar input.

Transaction correction:

```text
edit 12 -20k bensin kategori transport
hapus terakhir
undo
```

`edit` replaces the stored transaction content for that ID using the normal
manual parser. `hapus terakhir` and `hapus 12` now use soft delete, so active
reports ignore the deleted row. `undo` restores the latest deleted transaction
for the current Telegram chat only.

Reset flow:

1. Send `/reset`.
2. The bot asks for confirmation.
3. Reply exactly:

```text
YA RESET
```

## Deployment

Before deploying:

```powershell
npm.cmd test
npm.cmd run test:local-chat
npm.cmd run backup:csv
```

If category storage changes are not applied yet, apply the latest Supabase
migration before deploying code that reads `custom_categories`,
`category_aliases`, or `chat_sessions.pending_payload`.

Phase 1 transaction changes also require:

```text
supabase/migrations/20260423143000_add_transaction_soft_delete.sql
supabase/migrations/20260423153000_expand_budget_periods.sql
```

Set AI env vars for Preview and Production before deploying AI features:

```powershell
vercel.cmd env add AI_ENABLED production
vercel.cmd env add AI_PROVIDER production
vercel.cmd env add AI_API_KEY production
vercel.cmd env add AI_BASE_URL production
vercel.cmd env add AI_MODEL production
vercel.cmd env add AI_TEMPERATURE production
vercel.cmd env add AI_MAX_TOKENS production
vercel.cmd env add AI_TIMEOUT_MS production
```

Repeat for `preview`. If the CLI prompt would expose `AI_API_KEY`, use the
Vercel Dashboard instead.

Production deploy:

```powershell
vercel.cmd deploy --prod --yes
```

Reset Telegram webhook:

```powershell
$env:TELEGRAM_WEBHOOK_URL="https://keuangan-telegram.vercel.app/api/telegram/webhook"
npm.cmd run setup:webhook
```

Verify:

```powershell
npm.cmd run check:production
```

## Endpoints

Public:

```text
GET /health
GET /api/telegram/webhook
POST /api/telegram/webhook
```

Admin, requires `ADMIN_API_TOKEN`:

```text
GET /database/status
POST /simulate
POST /messages
POST /transactions
GET /transactions
GET /summary
DELETE /transactions/last
```

Admin example:

```powershell
Invoke-RestMethod `
  -Uri "https://keuangan-telegram.vercel.app/database/status" `
  -Headers @{"x-admin-api-token"=$env:ADMIN_API_TOKEN}
```

## Maintenance

- Debugging and rollback guide: [docs/RUNBOOK.md](./docs/RUNBOOK.md).
- Project plan: [docs/PROJECT_PLAN.md](./docs/PROJECT_PLAN.md).
- Local testing guide: [docs/LOCAL_TESTING.md](./docs/LOCAL_TESTING.md).

## Next Development Direction

The current phase is **category customization after AI-first input**.

Goals:

- Keep AI involved in natural input and category suggestions.
- Let users add custom categories without letting AI create messy categories
  silently.
- Store aliases and corrections per chat.
- Keep `+` and `-` as backward-compatible shortcuts while input modes remain
  the main flow.

Recommended priority:

1. Apply and verify the category storage migration before production deploy.
2. Test custom category, alias, and correction commands from Telegram.
3. Watch AI natural input quality after aliases are added.
4. Add merge/rename category commands if category usage grows.

## License

MIT. See [LICENSE](./LICENSE).
