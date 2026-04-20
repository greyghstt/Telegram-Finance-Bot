# Runbook Operasional

Panduan singkat saat bot lambat, tidak membalas, atau perlu dicek setelah
deploy.

## Cek Cepat

Jalankan dari folder project:

```powershell
npm.cmd run check:production
```

Yang dicek:

- `/health` production.
- `/database/status` dengan `ADMIN_API_TOKEN`.
- Telegram `getWebhookInfo`.

Hasil sehat biasanya:

```text
OK health - 200 ...
OK database/status - 200 ...
OK telegram webhook - ... pending=0 lastError=null
```

## Cek Webhook Telegram

```powershell
node -e "import('dotenv/config').then(async()=>{const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/getWebhookInfo'); console.log(await r.text())})"
```

Perhatikan:

- `url` harus mengarah ke
  `https://keuangan-telegram.vercel.app/api/telegram/webhook`.
- `pending_update_count` idealnya kecil atau `0`.
- `last_error_message` harus `null`.

## Cek Log Vercel

```powershell
vercel.cmd logs https://keuangan-telegram.vercel.app
```

Gunakan ini kalau Telegram tidak membalas atau ada error 500.

## Cek Endpoint Admin

```powershell
Invoke-RestMethod `
  -Uri "https://keuangan-telegram.vercel.app/database/status" `
  -Headers @{"x-admin-api-token"=$env:ADMIN_API_TOKEN}
```

Jika `401`, token admin di environment lokal atau Vercel perlu dicek.

## Deploy dan Rollback

Deploy production:

```powershell
vercel.cmd deploy --prod --yes
```

Rollback lewat dashboard Vercel:

1. Buka project `keuangan-telegram`.
2. Masuk ke tab Deployments.
3. Pilih deployment terakhir yang sehat.
4. Promote atau rollback ke deployment tersebut.

## Setelah Ganti Secret

Jika mengganti `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`ADMIN_API_TOKEN`, atau `DATABASE_URL`:

1. Update `.env` lokal.
2. Update environment variable di Vercel.
3. Deploy ulang.
4. Set ulang webhook:

```powershell
$env:TELEGRAM_WEBHOOK_URL="https://keuangan-telegram.vercel.app/api/telegram/webhook"
npm.cmd run setup:webhook
```

5. Jalankan:

```powershell
npm.cmd run check:production
```
