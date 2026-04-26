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

- Record transactions from Telegram income/expense input modes or natural language.
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

## AI-First Transaction Input

The main flow is natural Telegram text. Normal user messages go to the AI intent router first, then the app validates the structured intent before saving or executing anything.

Natural input examples:

```text
beli bensin 20 ribu
bayar makan 35rb via qris
gaji freelance masuk 1,5jt ke bca
makan ayam 27rb via qris kemarin #kantin
Rp125.000 buku kategori education 16/04/2026
```

Batch transactions:

```text
1. beli minimarket 12k
2. bayar bensin 20k
3. refund 100k masuk
```

Explicit input modes are still available when you want to choose the transaction type before sending the next message:

```text
/pemasukan
500k gaji

/pengeluaran
20k bensin
```

If the message is ambiguous, the bot asks for numbered clarification and saves nothing until the user chooses:

```text
1. Catat sebagai pengeluaran
2. Catat sebagai pemasukan
3. Bukan transaksi
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
transaksi rutin tambah bulanan 500k kos kategori housing
transaksi rutin
hapus rutin 2
tagihan tambah wifi 250k tiap 15 kategori bills
tagihan
tagihan hari ini
hapus tagihan 3
kategori baru kopi Kopi
alias kategori ngopi = kopi
koreksi kategori 12 food
edit 12 beli bensin 20k
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

AI-first routing:

- hard commands, session commands, auth, and destructive confirmations stay rule-based
- normal finance text goes to the AI intent router first
- the router returns structured JSON intent such as transaction create, transaction clarification, finance question, budget set, wallet transfer, or wallet balance action
- the app validates intent fields, amounts, transaction type, wallet names, and confidence before executing
- ambiguous or risky input returns numbered clarification instead of format guidance
- if AI is disabled or unavailable, the app uses a safe fallback and does not save uncertain data

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
default dompet bca
saldo dompet
saldo dompet bank
set saldo dompet bank 70230
tambah saldo dompet bank 20k
dompet
transfer bca cash 50k tarik tunai
transfer dari bca ke cash 50k tarik tunai
pindah 50k dari cash ke bca
topup gopay 100k
isi saldo 150k ke dana
saldo awal cash 200k
masuk ke bca 500k gaji
beli bensin 20k dompet cash
transaksi rutin tambah bulanan 500k kos kategori housing
transaksi rutin
hapus rutin 2
tagihan tambah wifi 250k tiap 15 kategori bills
tagihan
tagihan hari ini
hapus tagihan 3
```

Wallet balances combine wallet-tagged income and expense transactions with
wallet-to-wallet transfers plus explicit wallet balance entries. Transfers and
wallet balance set/adjust entries are stored separately so they do not inflate
income or expense summaries. Due bill reminder checks are scoped to the active
Telegram chat.

Wallet-aware flow:

- `set saldo dompet bank 70230` sets the tracked wallet balance only.
- `tambah saldo dompet bank 20k` adjusts the tracked wallet balance only.
- `masuk ke bca 500k gaji` saves income and tags wallet `bca`.
- `beli makan 20k dompet cash` saves expense and reduces wallet `cash`.
- `transfer bank cash 50k` moves value between wallets only.
- `default dompet bank` marks the fallback wallet for later expenses.
- for expense text without an explicit wallet:
  - use the named wallet when present
  - otherwise use the default wallet
  - otherwise use the single available wallet
  - otherwise ask for clarification

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

Natural extraction uses the quick AI path with compact JSON output. The app validates every candidate before saving and rejects uncertain output. Ambiguous input asks the user to reply with a numbered choice: `1` for expense, `2` for income, or `3` for not a transaction.

AI also routes wallet-aware intent such as `saldo bank 70230` or `bayar makan 20k pakai gopay`. The app remains the final validator and may ask for confirmation before executing sensitive actions such as wallet balance set. AI may suggest a category, but the app normalizes it to existing categories such as `food`, `education`, `transport`, or `housing`; unknown suggestions fall back to `other`.

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
edit 12 beli bensin 20k kategori transport
hapus terakhir
undo
```

`edit` replaces the stored transaction content for that ID using the same validated transaction path. `hapus terakhir` and `hapus 12` use soft delete, so active reports ignore the deleted row. `undo` restores the latest deleted transaction for the current Telegram chat only.

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

The current phase is **AI-first natural finance input with app-side validation**.

Goals:

- Route normal finance text through structured AI intent first.
- Keep hard commands, auth, destructive confirmations, and safe fallbacks rule-based.
- Let users add custom categories without letting AI create messy categories silently.
- Store aliases and corrections per chat.

Recommended priority:

1. Test natural input, wallet, transfer, budget, and deletion clarification from Telegram.
2. Watch AI intent quality for natural messages and ambiguous cases.
3. Add merge/rename category commands if category usage grows.

## License

MIT. See [LICENSE](./LICENSE).
