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
- Search transactions.
- Category summary.
- Custom categories, stored category aliases, and category correction commands.
- AI `/insight`, finance Q&A, budget suggestions, and natural transaction
  extraction through SumoPod with compact plain-text replies and manual
  fallbacks.
- Monthly budgets per Telegram chat.
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
    check-production.js
    ensure-local-secrets.js
    local-chat-scenario.js
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
```

Production check:

```powershell
npm.cmd run check:production
```

Operational notes are in [docs/RUNBOOK.md](./docs/RUNBOOK.md).

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
/budget
/cari bensin
/hapusterakhir
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
budget
cek budget
budget food 700k
saran budget
kategori baru kopi Kopi
alias kategori ngopi = kopi
koreksi kategori 12 food
cari bensin
hapus terakhir
hapus 12
export csv
reset
help
```

Input modes:

- `/pemasukan`, then the next message can be `500k gaji`.
- `/pengeluaran`, then the next message can be `20k bensin`.
- `/batal` cancels the active input mode.

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
budget transport 300k
hapus budget food
reset budget
saran budget
```

Budgets are monthly and stored per Telegram chat. Resetting all budgets from
Telegram requires `YA RESET BUDGET` confirmation.

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
```

If category storage changes are not applied yet, apply the latest Supabase
migration before deploying code that reads `custom_categories`,
`category_aliases`, or `chat_sessions.pending_payload`.

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
