# Keuangan Telegram

Bot Telegram pribadi untuk mencatat pemasukan dan pengeluaran lewat chat.

## Status

Project sudah live:

- Production: `https://keuangan-telegram.vercel.app`
- Webhook: `https://keuangan-telegram.vercel.app/api/telegram/webhook`
- Runtime: Vercel Functions region `syd1`
- Database: Supabase Postgres
- Repo: `https://github.com/greyghstt/keuangan-telegram`

Fitur utama:

- Catat transaksi dengan awalan `+` atau `-`.
- Mode input pemasukan/pengeluaran tanpa tanda lewat menu Telegram.
- Saldo, laporan harian, mingguan, bulanan, tahunan.
- Riwayat transaksi dengan ID dan timestamp WIB.
- Hapus transaksi terakhir atau hapus transaksi berdasarkan ID.
- Pencarian transaksi.
- Ringkasan kategori.
- Export CSV langsung sebagai file Telegram.
- Reset semua transaksi dengan konfirmasi `YA RESET`.
- Webhook dilindungi `TELEGRAM_WEBHOOK_SECRET`.
- Endpoint admin dilindungi `ADMIN_API_TOKEN`.

## Struktur

```text
Keuangan-Telegram/
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

Buat `.env` dari `.env.example`, lalu isi nilai asli di `.env` saja.

```env
PORT=3000
DATABASE_PATH=data/keuangan-telegram.sqlite
DATABASE_URL=
TELEGRAM_BOT_TOKEN=isi_token_baru_dari_botfather
TELEGRAM_ALLOWED_CHAT_IDS=123456789
TELEGRAM_WEBHOOK_URL=
TELEGRAM_WEBHOOK_SECRET=
ADMIN_API_TOKEN=
```

Catatan:

- `.env` berisi rahasia asli dan tidak boleh masuk Git.
- `.env.example` hanya template dan tidak boleh berisi token, password, atau
  chat ID asli.
- Jika password Supabase pernah sempat masuk repo, reset password dari
  dashboard Supabase lalu update `DATABASE_URL`.

## Jalankan Lokal

```powershell
npm.cmd install
npm.cmd run dev
```

Cek:

```text
http://localhost:3000/health
```

Bot polling lokal:

```powershell
npm.cmd run telegram
```

## Test

```powershell
npm.cmd test
npm.cmd run test:local-chat
```

Cek production:

```powershell
npm.cmd run check:production
```

Runbook operasional ada di [docs/RUNBOOK.md](./docs/RUNBOOK.md).

## Format Transaksi

Setiap transaksi manual wajib diawali tanda:

- `+` untuk pemasukan.
- `-` untuk pengeluaran.

Contoh:

```text
-20k bensin
-12rb makan
-Rp35.000 bayar makan
+500k gaji
+masuk 1,5jt freelance
-makan ayam 27rb via qris kemarin #kantin
-Rp125.000 buku kategori education 16/04/2026
```

Batch transaksi:

```text
1. -12k alfamid
2. -20k bensin
3. +100k refund
```

Nominal yang didukung:

- `20k`, `20rb`, `20r`, `20 rebu`
- `20.000`, `20,000`
- `1,5jt`, `2.5 juta`
- `Rp1.250.000`

Metadata yang didukung:

- Kategori otomatis: food, transport, groceries, bills, health, education,
  shopping, entertainment, housing, family, donation, debt, income, other.
- Kategori eksplisit: `kategori education`, `category food`, `cat transport`.
- Metode bayar: cash, qris, debit, kartu kredit, transfer bank, e-wallet.
- Tanggal: `hari ini`, `kemarin`, `besok`, `16/04/2026`, `2026-04-16`,
  `16 apr`.
- Tag: `#kantin`, `#kampus`.

## Command Telegram

Command menu:

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

Command teks:

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

Mode input:

- `/pemasukan`, lalu pesan berikutnya boleh `500k gaji`.
- `/pengeluaran`, lalu pesan berikutnya boleh `20k bensin`.
- `/batal` membatalkan mode input.

Reset data:

1. Kirim `/reset`.
2. Bot meminta konfirmasi.
3. Balas persis:

```text
YA RESET
```

## Deploy

Sebelum deploy:

```powershell
npm.cmd test
npm.cmd run test:local-chat
```

Deploy production:

```powershell
vercel.cmd deploy --prod --yes
```

Set ulang webhook:

```powershell
$env:TELEGRAM_WEBHOOK_URL="https://keuangan-telegram.vercel.app/api/telegram/webhook"
npm.cmd run setup:webhook
```

Verifikasi:

```powershell
npm.cmd run check:production
```

## Endpoint

Public:

```text
GET /health
GET /api/telegram/webhook
POST /api/telegram/webhook
```

Admin, perlu `ADMIN_API_TOKEN`:

```text
GET /database/status
POST /simulate
POST /messages
POST /transactions
GET /transactions
GET /summary
DELETE /transactions/last
```

Contoh admin:

```powershell
Invoke-RestMethod `
  -Uri "https://keuangan-telegram.vercel.app/database/status" `
  -Headers @{"x-admin-api-token"=$env:ADMIN_API_TOKEN}
```

## Maintenance

- Panduan cek error dan rollback: [docs/RUNBOOK.md](./docs/RUNBOOK.md).
- Plan project: [docs/PROJECT_PLAN.md](./docs/PROJECT_PLAN.md).
- Test lokal: [docs/LOCAL_TESTING.md](./docs/LOCAL_TESTING.md).

## License

MIT. Lihat [LICENSE](./LICENSE).
