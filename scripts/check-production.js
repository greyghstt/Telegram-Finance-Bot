import "dotenv/config";

const productionUrl = stripTrailingSlash(
  process.env.PRODUCTION_URL ?? "https://keuangan-telegram.vercel.app",
);

const checks = [];

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
    const response = await fetch(url, options);
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
  );
  const body = await response.json();
  const result = body.result ?? {};
  const elapsedMs = Date.now() - startedAt;
  const expectedUrl = `${productionUrl}/api/telegram/webhook`;

  checks.push({
    name: "telegram webhook",
    ok: Boolean(body.ok) && result.url === expectedUrl && !result.last_error_message,
    detail: [
      `${elapsedMs}ms`,
      `url=${result.url ?? "-"}`,
      `pending=${result.pending_update_count ?? "-"}`,
      `lastError=${result.last_error_message ?? "null"}`,
    ].join(" "),
  });
}

function summarizeBody(body) {
  return String(body ?? "").replace(/\s+/g, " ").slice(0, 120);
}

function stripTrailingSlash(value) {
  return String(value ?? "").replace(/\/+$/, "");
}
