import "dotenv/config";

const productionUrl = stripTrailingSlash(
  process.env.PRODUCTION_URL ?? "https://keuangan-telegram.vercel.app",
);

const checks = [];
const FETCH_TIMEOUT_MS = 10000;

await checkHttp("health", `${productionUrl}/health`);

if (process.env.ADMIN_API_TOKEN) {
  await checkHttp("database/status", `${productionUrl}/database/status`, {
    headers: {
      "x-admin-api-token": process.env.ADMIN_API_TOKEN,
    },
  });
} else {
  checks.push({
    name: "database/status",
    ok: false,
    detail: "ADMIN_API_TOKEN belum tersedia di environment lokal.",
  });
}

if (process.env.TELEGRAM_BOT_TOKEN) {
  await checkTelegramWebhook();
} else {
  checks.push({
    name: "telegram webhook",
    ok: false,
    detail: "TELEGRAM_BOT_TOKEN belum tersedia di environment lokal.",
  });
}

for (const check of checks) {
  const status = check.ok ? "OK" : "FAIL";
  console.log(`${status} ${check.name} - ${check.detail}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  process.exitCode = 1;
}

async function checkHttp(name, url, options = {}) {
  const startedAt = Date.now();

  try {
    const response = await fetch(url, withTimeout(options));
    const body = await response.text();
    const elapsedMs = Date.now() - startedAt;

    checks.push({
      name,
      ok: response.ok,
      detail: `${response.status} ${elapsedMs}ms ${summarizeBody(body)}`,
    });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      detail: error.message,
    });
  }
}

async function checkTelegramWebhook() {
  const startedAt = Date.now();
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  const body = await response.json();
  const result = body.result ?? {};
  const elapsedMs = Date.now() - startedAt;
  const expectedUrl = `${productionUrl}/api/telegram/webhook`;
  const webhookProbe = await probeWebhookRoute(expectedUrl);

  checks.push({
    name: "telegram webhook",
    ok: Boolean(body.ok)
      && result.url === expectedUrl
      && (result.pending_update_count ?? 0) === 0
      && webhookProbe.ok,
    detail: [
      `${elapsedMs}ms`,
      `url=${result.url ?? "-"}`,
      `pending=${result.pending_update_count ?? "-"}`,
      `lastError=${result.last_error_message ?? "null"}`,
      `probe=${webhookProbe.detail}`,
    ].join(" "),
  });
}

async function probeWebhookRoute(expectedUrl) {
  if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
    return { ok: false, detail: "skipped_no_secret" };
  }

  try {
    const response = await fetch(expectedUrl, withTimeout({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        update_id: 999999999,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 0, type: "private" },
          text: "incident webhook probe",
        },
      }),
    }));

    return {
      ok: response.ok,
      detail: `status_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error.name === "TimeoutError" ? "timeout" : "probe_failed",
    };
  }
}

function withTimeout(options = {}) {
  return {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  };
}

function summarizeBody(body) {
  return String(body ?? "").replace(/\s+/g, " ").slice(0, 120);
}

function stripTrailingSlash(value) {
  return String(value ?? "").replace(/\/+$/, "");
}
