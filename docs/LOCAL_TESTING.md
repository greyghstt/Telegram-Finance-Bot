# Local Testing Guide

Use this guide to test Telegram Finance Bot without a live Telegram webhook.
The goal is to verify the parser, database, commands, and bot replies before
running with a real Telegram token.

The bot command language remains Indonesian for now, so the examples below use
Indonesian commands and transaction notes.

## 1. Automated Tests

Run:

```powershell
npm.cmd test
```

Covered areas:

- Amount parser and command parser.
- In-memory SQLite database.
- Transaction saving.
- Balance summary.
- Commands such as `saldo`, `riwayat`, `hari ini`, and `hapus terakhir`.
- Telegram service behavior, including database-backed income/expense input
  modes.
- Chat ID access control.

The final test output should show all tests as passing.

## 2. Local Chat Scenario

Run:

```powershell
npm.cmd run test:local-chat
```

The script simulates this chat flow:

```text
+2jt gaji bca
-20k bensin
-makan ayam 27rb via qris #kantin
1. -12k minimarket
2. -8rb parkir
3. +100k refund
saldo
riwayat
kategori
cari bensin
hapus 2
hari ini
hapus terakhir
saldo
help
```

The current local scenario still covers explicit `+` and `-` input for
backward compatibility. The target input direction is to make signs optional
when the user has selected `/pemasukan` or `/pengeluaran`.

It uses a temporary database:

```text
data/local-chat-scenario.sqlite
```

That file is deleted automatically after the test finishes.

## 3. Local Server Test

Start the server:

```powershell
npm.cmd run dev
```

Keep that terminal running. Use a second terminal for requests.

### Health Check

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"
```

### Simulate a Bot Message

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/messages" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"message":"-20k bensin"}'
```

### Balance

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/messages" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"message":"saldo"}'
```

### History

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/messages" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"message":"riwayat"}'
```

### Delete Latest Transaction

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/messages" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"message":"hapus terakhir"}'
```

## 4. When to Test Live Telegram

Move to live Telegram testing when:

- `npm.cmd test` passes.
- `npm.cmd run test:local-chat` passes.
- `POST /messages` can save transactions locally.
- Commands like `saldo`, `hari ini`, `riwayat`, and `hapus terakhir` work.
- `.env` contains a fresh `TELEGRAM_BOT_TOKEN` from BotFather.

For webhook deployment, also make sure:

- `api/telegram/webhook.js` passes `node --check`.
- `scripts/setup-telegram-webhook.js` passes `node --check`.
- `DATABASE_URL` for Supabase is available before Vercel deployment.

Fix local failures before deploying.
