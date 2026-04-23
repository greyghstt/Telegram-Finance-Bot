# Operations Runbook

Use this short runbook when the bot is slow, does not reply, or needs a
post-deploy health check.

## Quick Check

Run from the project folder:

```powershell
npm.cmd run check:production
```

It checks:

- Production `/health`.
- `/database/status` with `ADMIN_API_TOKEN`.
- Telegram `getWebhookInfo`.

Healthy output should look like:

```text
OK health - 200 ...
OK database/status - 200 ...
OK telegram webhook - ... pending=0 lastError=null
```

## Check Telegram Webhook

```powershell
node -e "import('dotenv/config').then(async()=>{const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/getWebhookInfo'); console.log(await r.text())})"
```

Look for:

- `url` should be
  `https://keuangan-telegram.vercel.app/api/telegram/webhook`.
- `pending_update_count` should be small or `0`.
- `last_error_message` should be `null`.

## Check Vercel Logs

```powershell
vercel.cmd logs https://keuangan-telegram.vercel.app
```

Use this when Telegram does not reply or an endpoint returns 500.

## Check Admin Endpoint

```powershell
Invoke-RestMethod `
  -Uri "https://keuangan-telegram.vercel.app/database/status" `
  -Headers @{"x-admin-api-token"=$env:ADMIN_API_TOKEN}
```

If it returns `401`, check the local or Vercel `ADMIN_API_TOKEN`.

## Troubleshoot AI Insight

AI features include `/insight`, `tanya ...`, `saran budget`, and natural
transaction extraction. Existing non-AI commands should continue to work when
AI is disabled, the key is missing, or SumoPod is unavailable.

Local checks:

```powershell
npm.cmd test
npm.cmd run test:local-chat
```

Configuration checks:

- `AI_ENABLED=false` should use the manual fallback.
- `AI_ENABLED=true` also requires `AI_API_KEY`.
- `AI_BASE_URL` should normally be `https://ai.sumopod.com/v1`.
- `AI_MODEL` should start as `MiniMax-M2.7-highspeed`.
- `AI_MAX_TOKENS` should be `2500`.
- `AI_TIMEOUT_MS` should be `25000`.
- Never print or paste `AI_API_KEY` in logs, screenshots, issues, or commits.

If `/insight` returns only the manual fallback while AI should be active, check
for a missing key, provider timeout, exhausted provider balance, or invalid
model name. Existing non-AI commands should continue to work.

AI replies are sent to Telegram as plain text. The app renders the key numbers
it computed first, then strips common Markdown markers from AI explanations. If
the output still looks malformed, check the prompt in `src/ai-service.js` and
the reply builders in `src/message-handler.js` before changing Telegram
`parse_mode`.

## Check AI Performance

The next optimization phase should keep AI involvement high while making the
bot feel faster. When investigating slow replies, separate these timings:

- database query time
- AI request time
- formatting/reply time
- total Telegram response time

Healthy direction:

- normal deterministic commands should stay fast
- quick AI extraction should use compact prompts and small JSON output
- deep AI analysis may take longer but should still return within the configured
  timeout
- repeated insight-style requests may be cached later if the data has not
  changed

Do not fix slow responses by simply removing AI from the product direction.
Prefer prompt compaction, smaller AI payloads, profile-specific timeouts, and
better fallback behavior.

Future optimization may introduce separate quick/deep AI settings. Document new
variables before deploying them.

## Category Quality Checks

Future category improvements should use AI suggestions with app-side
normalization.

Check that:

- AI category suggestions map to known categories when possible.
- Unknown category suggestions do not create messy production data silently.
- User corrections can later become aliases or category rules.
- Reports display friendly category labels, not raw technical labels, whenever
  possible.

## Vercel AI Environment

Required AI variables for both Preview and Production:

```text
AI_ENABLED=true
AI_PROVIDER=sumopod
AI_API_KEY=<set in Vercel only>
AI_BASE_URL=https://ai.sumopod.com/v1
AI_MODEL=MiniMax-M2.7-highspeed
AI_TEMPERATURE=0.2
AI_MAX_TOKENS=2500
AI_TIMEOUT_MS=25000
```

Use Vercel CLI only if the value can be passed without printing secrets. If
the CLI prompt would expose `AI_API_KEY`, set it manually in the Vercel
Dashboard instead.

## Deploy and Rollback

Production deploy:

```powershell
vercel.cmd deploy --prod --yes
```

Rollback from Vercel Dashboard:

1. Open the `telegram-finance-bot` project.
2. Go to Deployments.
3. Select the latest healthy deployment.
4. Promote or roll back to that deployment.

## After Secret Changes

If you change `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`ADMIN_API_TOKEN`, or `DATABASE_URL`:

1. Update local `.env`.
2. Update Vercel environment variables.
3. Redeploy.
4. Reset the Telegram webhook:

```powershell
$env:TELEGRAM_WEBHOOK_URL="https://keuangan-telegram.vercel.app/api/telegram/webhook"
npm.cmd run setup:webhook
```

5. Run:

```powershell
npm.cmd run check:production
```
