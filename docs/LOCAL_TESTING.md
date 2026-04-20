# Local Testing Guide

Panduan ini dipakai untuk mengetes Keuangan Telegram tanpa Telegram live. Tujuannya
memastikan parser, database, command, dan balasan bot sudah berjalan sebelum
bot dijalankan memakai token Telegram.

## 1. Test Otomatis

Jalankan:

```bash
npm.cmd test
```

Yang dites:

- Parser nominal dan command.
- Database SQLite in-memory.
- Simpan transaksi.
- Ringkasan saldo.
- Command `saldo`, `riwayat`, `hari ini`, dan `hapus terakhir`.
- Service Telegram, termasuk mode input pemasukan/pengeluaran yang disimpan
  di database.
- Pembatasan akses chat ID.

Jika berhasil, hasil akhirnya harus menunjukkan semua test `pass`.

## 2. Test Chat Lokal

Jalankan:

```bash
npm.cmd run test:local-chat
```

Script ini akan mensimulasikan chat berikut:

Untuk transaksi, tanda `+` atau `-` di awal pesan wajib dipakai:

```text
+2jt gaji bca
-20k bensin
-makan ayam 27rb via qris #kantin
1. -12k alfamid
2. -8rb parkir
3. +100k refund
saldo
riwayat
hari ini
hapus terakhir
saldo
help
```

Script memakai database sementara:

```text
data/local-chat-scenario.sqlite
```

File tersebut akan dihapus otomatis setelah test selesai.

## 3. Test Server Lokal

Jalankan server:

```bash
npm.cmd run dev
```

Biarkan terminal tetap menyala. Buka terminal kedua untuk mengirim request.

### Cek Server

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"
```

### Simulasi Pesan Bot

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/messages" -Method Post -ContentType "application/json" -Body '{"message":"-20k bensin"}'
```

### Cek Saldo

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/messages" -Method Post -ContentType "application/json" -Body '{"message":"saldo"}'
```

### Cek Riwayat

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/messages" -Method Post -ContentType "application/json" -Body '{"message":"riwayat"}'
```

### Hapus Transaksi Terakhir

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/messages" -Method Post -ContentType "application/json" -Body '{"message":"hapus terakhir"}'
```

## 4. Kapan Lanjut ke Telegram Live

Lanjut menjalankan bot Telegram jika:

- `npm.cmd test` berhasil.
- `npm.cmd run test:local-chat` berhasil.
- Endpoint `POST /messages` bisa menyimpan transaksi.
- Command `saldo`, `hari ini`, `riwayat`, dan `hapus terakhir` berjalan.
- `.env` sudah berisi `TELEGRAM_BOT_TOKEN` baru dari BotFather.

Untuk persiapan deploy webhook, pastikan juga:

- `api/telegram/webhook.js` lolos `node --check`.
- `scripts/setup-telegram-webhook.js` lolos `node --check`.
- `DATABASE_URL` Supabase sudah tersedia sebelum deploy Vercel.

Jika salah satu belum berjalan, perbaiki dulu di lokal.
