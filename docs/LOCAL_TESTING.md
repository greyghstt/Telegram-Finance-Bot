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
- Read-only `insight` command fallback behavior when AI is disabled or
  unavailable.
- Finance Q&A, budget progress, and budget suggestion fallback behavior.
- Plain-text Telegram formatting for AI-assisted replies.
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
insight
tanya bulan ini boros di mana?
budget food 100k
cek budget
saran budget
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

### Insight

With `AI_ENABLED=false`, or without `AI_API_KEY`, the command returns a manual
Indonesian summary and does not need network access:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/messages" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"message":"insight"}'
```

To test SumoPod locally, set the AI variables in local `.env` only. The command
sends summarized data, not a full transaction dump.

### Finance Q&A

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/messages" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"message":"tanya bulan ini boros di mana?"}'
```

The app computes the summary, categories, recent transactions, and matching
transactions before calling AI. Tests stub this behavior and do not need a real
API key. The Telegram reply should show the app-computed summary first and any
AI explanation as plain text.

### Budget

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/messages" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"message":"budget food 700k"}'
```

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/messages" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"message":"cek budget"}'
```

### Natural Input

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/messages" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"message":"tadi beli bensin 20 ribu dan makan ayam 15 ribu"}'
```

With AI disabled or unavailable, this falls back to manual format guidance.
With AI enabled, candidates are saved only after app-side validation.

### Future Performance Tests

The next optimization phase should add a repeatable way to compare response
time across:

- mode input without signs
- natural AI input
- `insight`
- `tanya bulan ini boros di mana?`
- `cek budget`
- `saran budget`

The goal is to keep AI involved while making each AI path more focused.
Quick AI paths should return compact JSON. Deep AI paths may return richer
plain-text explanations.

### Future Category Tests

AI category suggestions should be tested with examples such as:

```text
ayam geprek dekat kampus
praktikum elektronika
oli motor
bayar kos
```

Expected behavior:

- map obvious inputs to existing categories
- reject or clarify ambiguous categories
- keep reports using friendly category labels
- never create new categories silently unless custom category support is
  intentionally implemented

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
