# Project Plan: Keuangan Telegram

Dokumen ini menjadi pegangan agar arah project tidak hilang. Project dibuat
bertahap untuk belajar, bukan langsung sebagai produk besar.

## Tujuan

Membuat bot Telegram pribadi untuk mencatat pemasukan dan pengeluaran dengan
format chat yang singkat.

Contoh:

Transaksi wajib diawali tanda:

- `+` untuk pemasukan.
- `-` untuk pengeluaran.

```text
-20k bensin
+500k gaji
saldo
hari ini
hapus terakhir
```

## Prinsip Project

- Mulai dari versi kecil yang bisa berjalan.
- Test logic utama sebelum integrasi Telegram live.
- Simpan rahasia seperti token API di `.env`, bukan di kode.
- Gunakan database lokal dulu agar mudah belajar.
- Jangan hapus data transaksi tanpa fitur konfirmasi atau backup.
- Saat deploy, gunakan webhook Telegram dan database cloud. Polling lokal tetap
  dipertahankan hanya untuk belajar dan testing.
- Token Telegram, database URL, dan secret lain wajib berada di environment
  variables Vercel/Supabase, bukan di repository.

## Roadmap Ringkas

1. Setup project backend.
2. Buat endpoint test `/health`.
3. Buat parser pesan. **Selesai awal.**
4. Buat database lokal. **Selesai awal.**
5. Buat fitur catat transaksi. **Selesai awal.**
6. Buat fitur laporan. **Selesai awal.**
7. Test tanpa Telegram live. **Selesai awal.**
8. Setup Telegram Bot. **Selesai awal.**
9. Jalankan bot polling lokal.
10. Test pemakaian harian di Telegram.
11. Rapikan command Telegram.
12. Rapikan command Telegram. **Selesai awal.**
13. Rapikan format balasan. **Selesai awal.**
14. Tambah keyboard cepat dan command menu Telegram. **Selesai awal.**
15. Tambah mode input pemasukan/pengeluaran tanpa tanda `+`/`-`. **Selesai awal lokal.**
16. Siapkan database cloud Supabase.
17. Refactor database layer dari SQLite sync ke Postgres async.
18. Refactor bot polling menjadi service reusable.
19. Buat webhook Vercel untuk Telegram.
20. Set environment variables di Vercel.
21. Deploy preview ke Vercel.
22. Set Telegram webhook ke URL Vercel.
23. Test live dari Telegram.
24. Hardening security, logging, backup, dan rollback.

## Step 1: Setup Project Backend

Status: **selesai sebagian**.

Yang dibuat:

- Folder `Keuangan-Telegram`.
- Folder `src`, `docs`, dan `data`.
- File `package.json`.
- File `.env.example`.
- File `.gitignore`.
- File `src/server.js`.
- File `README.md`.
- File `docs/PROJECT_PLAN.md`.

Catatan:

- Node.js sudah terinstall dan project berhasil dijalankan dengan `npm.cmd`.
- Gunakan `npm.cmd` jika PowerShell memblokir script `npm.ps1`.
- Setelah dependency terinstall, jalankan `npm.cmd run dev`.

## Step 2: Endpoint Test

Status: **selesai awal**.

Endpoint:

```text
GET /
GET /health
```

Tujuan:

- Memastikan server backend hidup.
- Menjadi titik test paling sederhana sebelum menambah fitur lain.
- Memberi respons jelas saat membuka `http://localhost:3000`.

## Step 3: Parser Pesan

Status: **selesai awal**.

Target:

- `-20k bensin` menjadi pengeluaran Rp20.000.
- `-12rb makan` menjadi pengeluaran Rp12.000.
- `+500k gaji` menjadi pemasukan Rp500.000.
- `saldo` menjadi command cek saldo.
- `hari ini` menjadi command laporan harian.
- `hapus terakhir` menjadi command hapus transaksi terakhir.

Tambahan yang sudah didukung:

- Nominal `20.000`, `20,000`, `20k`, `20rb`, `20r`, `20 rebu`,
  `1,5jt`, `2.5 juta`, `Rp1.250.000`.
- Prefix `Rp`, tanda `+` untuk pemasukan, tanda `-` untuk pengeluaran.
- Setiap transaksi wajib diawali tanda `+` atau `-` agar user menentukan
  sendiri jenis transaksinya.
- Keyword `masuk`, `pemasukan`, `keluar`, `pengeluaran`, `bayar`, `beli`
  tetap bisa ditulis sebagai bagian dari catatan.
- Catatan bisa berada sebelum atau sesudah nominal setelah tanda `+` atau `-`.
- Kategori otomatis awal: `food`, `transport`, `groceries`, `bills`,
  `health`, `education`, `shopping`, `entertainment`, `housing`, `family`,
  `donation`, `debt`, `income`, dan `other`.
- Kategori eksplisit dengan format `kategori education`, `category food`,
  atau `cat transport`.
- Metode bayar: `cash`, `qris`, `debit`, `credit_card`, `bank_transfer`,
  dan `ewallet`.
- Tanggal sederhana: `hari ini`, `kemarin`, `besok`, `16/04/2026`,
  `2026-04-16`, dan `16 apr`.
- Tag dengan hashtag seperti `#kantin`.
- Multi-line input untuk beberapa transaksi sekaligus.
- Input bernomor seperti `1. -12k makan`.
- Endpoint simulasi `POST /simulate`.
- Test otomatis parser lewat `npm.cmd test`.

## Step 4: Database Lokal

Status: **selesai awal**.

Rencana:

- Pakai SQLite bawaan Node.js melalui `node:sqlite`.
- Simpan file database default di `data/keuangan-telegram.sqlite`.
- Lokasi database bisa diatur lewat `DATABASE_PATH`.
- Buat tabel `transactions`.
- Tambah index untuk query berdasarkan waktu, tipe, dan kategori.
- Tambah test database in-memory.

Kolom awal:

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
created_at
updated_at
```

Endpoint database yang sudah tersedia:

```text
GET /database/status
POST /transactions
GET /transactions
GET /summary
DELETE /transactions/last
```

## Step 5: Fitur Catat Transaksi

Status: **selesai awal**.

Target:

- Input pemasukan dan pengeluaran tersimpan lewat `POST /messages`.
- Batch transaksi juga bisa tersimpan lewat `POST /messages`.
- Saldo dihitung dari total pemasukan dikurangi total pengeluaran.
- Balasan teks bot tersedia di field `reply`.

## Step 6: Fitur Laporan

Status: **selesai awal**.

Command awal:

```text
saldo
hari ini
minggu ini
bulan ini
riwayat
hapus terakhir
export csv
help
kategori
cari bensin
hapus 12
```

Yang sudah berjalan:

- `saldo`: ringkasan semua transaksi.
- `hari ini`: laporan harian berdasarkan zona waktu Asia/Jakarta.
- `minggu ini`: laporan minggu berjalan.
- `bulan ini`: laporan bulan berjalan.
- `tahun ini`: laporan tahun berjalan.
- `riwayat`: 10 transaksi terakhir.
- `hapus terakhir`: hapus transaksi terakhir dan tampilkan saldo baru.
- `hapus 12`: hapus transaksi berdasarkan ID.
- `kategori`: ringkasan berdasarkan kategori.
- `cari bensin`: pencarian transaksi berdasarkan catatan/kategori/metode/tag.
- `export csv`: mengembalikan CSV di API dan mengirim file CSV di Telegram.

## Step 7: Test Tanpa Telegram Live

Status: **selesai awal**.

Tujuan:

- Test parser dan database dari API lokal dulu.
- Mengurangi kebingungan sebelum bot Telegram dijalankan live.

Yang sudah dibuat:

- Test otomatis dengan `npm.cmd test`.
- Simulasi chat lokal dengan `npm.cmd run test:local-chat`.
- Panduan test lokal di `docs/LOCAL_TESTING.md`.
- Script `scripts/local-chat-scenario.js` memakai database sementara dan
  menghapusnya setelah selesai.

## Step 8: Setup Telegram Bot

Status: **selesai awal**.

Rencana:

- Buat bot lewat BotFather.
- Simpan token baru di `.env` sebagai `TELEGRAM_BOT_TOKEN`.
- Jalankan bot polling lokal dengan `npm.cmd run telegram`.
- Bot menerima pesan Telegram dan memprosesnya lewat `handleMessage()`.
- Bot membalas memakai field `reply`.

Catatan keamanan:

- Token yang pernah dikirim di chat harus dianggap bocor.
- Revoke token lama di BotFather dan gunakan token baru di `.env`.

## Step 9: Command, Keyboard, dan Mode Input

Status: **selesai awal lokal**.

Yang sudah berjalan:

- Command menu Telegram didaftarkan lewat `setMyCommands`.
- Tombol menu bawaan Telegram diarahkan ke daftar command.
- Keyboard cepat di bawah chat:

```text
Input Pemasukan
Input Pengeluaran
Saldo
Hari Ini
Riwayat
Bantuan
Export CSV
Hapus Terakhir
Kategori
```

- `Input Pemasukan` dan `/pemasukan` membuat pesan berikutnya otomatis
  dianggap pemasukan walau tanpa tanda `+`.
- `Input Pengeluaran` dan `/pengeluaran` membuat pesan berikutnya otomatis
  dianggap pengeluaran walau tanpa tanda `-`.
- `/batal` membatalkan mode input sementara.
- `/stop` menyembunyikan keyboard custom.
- `/kategori` menampilkan ringkasan kategori.
- `/cari kata-kunci` mencari transaksi.

Catatan penting untuk deploy:

- Mode input sementara disimpan di tabel `chat_sessions`, bukan memory.
- Reset data memakai `pending_action` di `chat_sessions` agar konfirmasi aman.

Target tabel tambahan:

```text
chat_sessions
id
chat_id
pending_input_mode
pending_action
created_at
updated_at
```

## Step 10: Tanggal dan Export

Status: **selesai awal lokal**.

Yang sudah berjalan:

- Riwayat menampilkan tanggal dan jam transaksi dalam zona Asia/Jakarta.
- Laporan periode menampilkan tanggal pada daftar transaksi terakhir.
- Balasan transaksi berhasil dicatat menampilkan tanggal.
- Balasan `hapus terakhir` menampilkan tanggal transaksi yang dihapus.
- Export CSV menambahkan `created_at_local` selain `created_at`.
- Di Telegram, export dikirim sebagai file dokumen `.csv`.

Contoh format:

```text
-Rp 20.000 bensin [transport] - 18 Apr 2026, 12.47 WIB
```

## Step 11: Target Arsitektur Deploy

Status: **selesai production**.

Target production:

```text
Telegram
  -> Webhook Vercel
  -> Bot service
  -> Supabase Postgres
```

Bukan lagi:

```text
Komputer lokal
  -> Polling Telegram
  -> SQLite lokal
```

Komponen target:

- Vercel Functions untuk endpoint webhook Telegram.
- Supabase Postgres untuk transaksi dan mode input per chat.
- Vercel environment variables untuk token dan database URL.
- Script setup webhook untuk mendaftarkan webhook dan command Telegram.

## Step 12: Supabase Postgres

Status: **selesai production**.

Status terbaru:

- Supabase CLI sudah terinstall dan terbaca.
- Versi CLI saat dicek: `2.90.0`.
- Supabase CLI sudah login dan bisa melihat project.
- Project remote yang ditemukan:

```text
name: greyghstt's Project
project ref: tjzcswajybrsgbaewhun
region: Oceania (Sydney)
```

- Project lokal sudah berhasil di-link:

```powershell
supabase link --project-ref tjzcswajybrsgbaewhun --yes
```

- File lokal `supabase/.temp/` dibuat oleh Supabase CLI dan sudah diabaikan
  lewat `.gitignore`.

Sudah selesai:

- `DATABASE_URL` memakai Supabase Shared Pooler.
- Migration awal dan migration `pending_action` sudah di-push ke remote.
- Tabel `transactions` dan `chat_sessions` sudah tersedia di Supabase.

Sudah dibuat lokal:

```text
supabase/migrations/20260420075334_init_keuangan_schema.sql
supabase/migrations/20260420100000_add_chat_session_pending_action.sql
```

Isi migration:

- Membuat tabel `transactions`.
- Membuat index transaksi berdasarkan waktu, tipe, dan kategori.
- Membuat tabel `chat_sessions`.
- Membuat index `chat_sessions(chat_id)`.
- Mengaktifkan RLS untuk `transactions` dan `chat_sessions`.

Tujuan:

- Mengganti SQLite lokal dengan database cloud yang cocok untuk Vercel.
- Menyimpan transaksi secara permanen.
- Menyimpan mode input sementara per chat agar stabil di serverless.

Tabel `transactions`:

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
created_at
updated_at
```

Tabel `chat_sessions`:

```text
id
chat_id
pending_input_mode
pending_action
created_at
updated_at
```

Index awal:

```text
transactions(created_at DESC)
transactions(type, created_at DESC)
transactions(category, created_at DESC)
chat_sessions(chat_id)
```

Catatan keamanan Supabase:

- Jangan expose service role key ke frontend.
- Untuk project ini, akses database dilakukan server-side dari Vercel.
- Jika memakai schema `public`, pertimbangkan RLS sebagai defense in depth.

## Step 13: Refactor Database Layer

Status: **selesai production**.

Masalah saat ini:

- `src/database.js` memakai `node:sqlite`.
- API database sekarang sinkron.
- Vercel + Supabase membutuhkan database cloud dan operasi async.

Rencana:

- Tambahkan dependency Postgres client, misalnya `postgres`.
- Ubah function database menjadi async:

```text
initializeDatabase()
saveTransaction()
saveTransactions()
getSummary()
getCategorySummary()
listTransactions()
deleteLastTransaction()
getDatabaseStatus()
getChatSession()
setChatSessionMode()
clearChatSessionMode()
```

- Update `message-handler.js` agar mendukung async.
- Update test otomatis.
- Pertahankan kemampuan test lokal dengan database test atau adapter.

## Step 14: Refactor Bot Service

Status: **selesai production**.

Masalah saat ini:

- `src/telegram-bot.js` mencampur polling, command Telegram, state mode input,
  dan pengiriman pesan.

Rencana file:

```text
src/telegram-service.js
src/telegram-bot.js
api/telegram/webhook.js
scripts/setup-telegram-webhook.js
```

Tanggung jawab:

- `telegram-service.js`: logic reusable untuk memproses update Telegram.
- `telegram-bot.js`: polling lokal untuk testing.
- `api/telegram/webhook.js`: endpoint Vercel.
- `setup-telegram-webhook.js`: set webhook, command menu, dan chat menu button.

## Step 15: Vercel Webhook

Status: **selesai production**.

Endpoint target:

```text
POST /api/telegram/webhook
```

Alur:

```text
Telegram update
-> Vercel webhook
-> validasi chat ID
-> normalize command / input mode
-> handleMessage()
-> sendMessage()
```

Catatan:

- Jangan pakai polling di Vercel.
- Jangan mengandalkan memory untuk mode input.
- Pastikan response webhook cepat.
- Log error secukupnya tanpa menampilkan token.

File yang sudah dibuat:

- `api/telegram/webhook.js`
- `src/telegram-service.js`

Catatan implementasi:

- Polling lokal dan webhook Vercel memakai service Telegram yang sama.
- Mode input pemasukan/pengeluaran disimpan di tabel `chat_sessions`.
- Endpoint `GET /api/telegram/webhook` bisa dipakai sebagai health check ringan.

## Step 16: Environment Variables

Status: **sebagian selesai**.

Environment lokal:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ALLOWED_CHAT_IDS
DATABASE_PATH
DATABASE_URL
TELEGRAM_WEBHOOK_URL
```

Environment Vercel target:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ALLOWED_CHAT_IDS
DATABASE_URL
NODE_ENV=production
```

Yang tidak boleh:

```text
NEXT_PUBLIC_TELEGRAM_BOT_TOKEN
NEXT_PUBLIC_DATABASE_URL
```

Command Vercel:

```powershell
vercel.cmd login
vercel.cmd whoami
vercel.cmd link
vercel.cmd env add TELEGRAM_BOT_TOKEN
vercel.cmd env add TELEGRAM_ALLOWED_CHAT_IDS
vercel.cmd env add DATABASE_URL
vercel.cmd deploy
```

Status environment lokal terbaru:

```text
TELEGRAM_BOT_TOKEN=SET
TELEGRAM_ALLOWED_CHAT_IDS=SET
DATABASE_URL=SET
```

Catatan:

- `.env.example` sudah ditambah `DATABASE_URL` dan `TELEGRAM_WEBHOOK_URL`.
- `DATABASE_URL` sudah memakai Supabase Shared Pooler.
- Jangan memakai prefix `NEXT_PUBLIC_` untuk token Telegram atau database URL.

## Step 17: Setup Telegram Webhook

Status: **selesai live**.

Setelah mendapatkan URL Vercel:

```text
https://nama-project.vercel.app/api/telegram/webhook
```

Script `scripts/setup-telegram-webhook.js` harus:

- Memanggil `setWebhook`.
- Memanggil `setMyCommands`.
- Memanggil `setChatMenuButton`.
- Menampilkan status berhasil/gagal.

Command target:

```powershell
npm.cmd run setup:webhook
```

Syarat sebelum menjalankan:

- Deploy Vercel sudah punya URL.
- `TELEGRAM_WEBHOOK_URL` terisi, atau environment Vercel menyediakan `VERCEL_URL`.
- `TELEGRAM_BOT_TOKEN` sudah token baru yang aman.

Status live:

```text
Webhook URL: https://keuangan-telegram.vercel.app/api/telegram/webhook
Telegram pending updates: 0
Telegram last error: none
```

## Step 18: Test Live

Status: **selesai live**.

Checklist test Telegram:

```text
/start
/id
/pemasukan
500k gaji
/pengeluaran
20k bensin
saldo
riwayat
hari ini
hapus terakhir
/batal
```

Checklist hasil:

- Chat ID yang tidak diizinkan ditolak.
- Input manual dengan `+` dan `-` tetap berjalan.
- Input lewat mode pemasukan/pengeluaran berjalan tanpa tanda.
- Riwayat menampilkan tanggal.
- Data masuk ke Supabase.
- Command menu dan keyboard custom muncul.
- `/stop` menyembunyikan keyboard custom.

Status teknis:

- Endpoint `GET /api/telegram/webhook` sudah hidup.
- Endpoint `GET /health` sudah hidup dan memakai database `postgres`.
- Test chat nyata masih perlu dicoba manual dari aplikasi Telegram.

## Step 19: Hardening dan Operasional

Status: **sebagian selesai**.

Security checklist:

- Revoke token Telegram lama.
- Reset password database Supabase dari dashboard karena password lama pernah
  masuk ke `.env.example` dan commit Git.
- Pastikan token baru hanya ada di `.env` lokal dan Vercel env.
- Pastikan `.env` tidak masuk repository.
- Jalankan secret scan sebelum deploy.
- Pastikan `TELEGRAM_ALLOWED_CHAT_IDS` aktif.
- Pastikan error log tidak mencetak token.
- Pastikan `TELEGRAM_WEBHOOK_SECRET` aktif di webhook.
- Pastikan endpoint admin memakai `ADMIN_API_TOKEN`.

DevOps checklist:

- `npm.cmd test` wajib lulus sebelum deploy. Status terakhir: lulus 38 test.
- `npm.cmd run test:local-chat` wajib lulus sebelum deploy. Status terakhir: lulus.
- Deploy production dari Vercel/GitHub sudah berjalan.
- Simpan URL preview.
- Dokumentasi runbook tersedia di `docs/RUNBOOK.md`.
- Script monitoring ringan tersedia di `npm.cmd run check:production`.

## Step 20: Deploy

Status: **selesai production deploy awal**.

Target:

- Vercel untuk webhook bot.
- Supabase Postgres untuk database.

Urutan deploy:

1. Login Vercel CLI.
2. Link project ke Vercel.
3. Set environment variables.
4. Deploy preview.
5. Set Telegram webhook ke preview/production URL.
6. Test live dari Telegram.
7. Jika stabil, promote ke production.

Catatan:

- Vercel CLI sudah terinstall dan bisa dipanggil dengan `vercel.cmd`.
- Jika `vercel` tanpa `.cmd` diblokir PowerShell, tetap gunakan `vercel.cmd`.
- Supabase CLI sudah terhubung ke project `tjzcswajybrsgbaewhun`.
- Migration awal sudah ada di `supabase/migrations/20260420075334_init_keuangan_schema.sql`.
- Project Vercel linked ke `greyghstts-projects/keuangan-telegram`.
- GitHub repo private: `https://github.com/greyghstt/keuangan-telegram`.
- Branch utama: `main`.
- Branch preview manual: `preview`.
- Production URL utama: `https://keuangan-telegram.vercel.app`.
- Health check: `https://keuangan-telegram.vercel.app/health`.
- Webhook Telegram: `https://keuangan-telegram.vercel.app/api/telegram/webhook`.
- Endpoint admin production dilindungi `ADMIN_API_TOKEN`.
- Telegram webhook production dilindungi `TELEGRAM_WEBHOOK_SECRET`.

Preview environment:

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`, dan `DATABASE_URL` sudah
  diset untuk branch preview `preview`.
- Untuk mengetes perubahan tanpa langsung mengubah production, buat perubahan
  di branch `preview`, push ke GitHub, lalu cek deployment preview di Vercel.
