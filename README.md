# Telegram Finance Bot

A private Telegram bot for tracking income and expenses through chat.

The repository and documentation are in English. The Telegram bot itself still
uses Indonesian commands, parser examples, and replies because that is the
current target usage.

## Status

The project is live:

- Production: `https://telegram-finance-bot.vercel.app`
- Webhook: `https://telegram-finance-bot.vercel.app/api/telegram/webhook`
- Runtime: Vercel Functions in `syd1`
- Database: Supabase Postgres
- Repository: `https://github.com/greyghstt/telegram-finance-bot`

Main features:

- Record transactions with a leading `+` or `-`.
- Income/expense input modes from Telegram menu buttons.
- Balance, daily, weekly, monthly, and yearly reports.
- Transaction history with IDs and WIB timestamps.
- Delete the latest transaction or delete by ID.
- Search transactions.
- Category summary.
- Export CSV as a Telegram document.
- Reset all transactions with `YA RESET` confirmation.
- Telegram webhook protected by `TELEGRAM_WEBHOOK_SECRET`.
- Admin endpoints protected by `ADMIN_API_TOKEN`.

## Project Structure

```text
Telegram-Finance-Bot/
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
```

Notes:

- `.env` contains real secrets and must not be committed.
- `.env.example` is a safe template and must not contain real tokens,
  passwords, or private chat IDs.
- If a Supabase password was ever committed, reset it in Supabase Dashboard and
  update `DATABASE_URL`.

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

Manual transactions must start with:

- `+` for income.
- `-` for expense.

Examples, intentionally kept in Indonesian because the bot parser currently
targets Indonesian daily usage:

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
1. -12k alfamid
2. -20k bensin
3. +100k refund
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

Production deploy:

```powershell
vercel.cmd deploy --prod --yes
```

Reset Telegram webhook:

```powershell
$env:TELEGRAM_WEBHOOK_URL="https://telegram-finance-bot.vercel.app/api/telegram/webhook"
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
  -Uri "https://telegram-finance-bot.vercel.app/database/status" `
  -Headers @{"x-admin-api-token"=$env:ADMIN_API_TOKEN}
```

## Maintenance

- Debugging and rollback guide: [docs/RUNBOOK.md](./docs/RUNBOOK.md).
- Project plan: [docs/PROJECT_PLAN.md](./docs/PROJECT_PLAN.md).
- Local testing guide: [docs/LOCAL_TESTING.md](./docs/LOCAL_TESTING.md).

## License

MIT. See [LICENSE](./LICENSE).
