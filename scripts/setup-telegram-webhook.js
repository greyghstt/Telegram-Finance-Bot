import "dotenv/config";
import { BOT_COMMANDS, postTelegram } from "../src/telegram-service.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = getWebhookUrl();
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || token === "isi_token_baru_dari_botfather") {
  console.error("TELEGRAM_BOT_TOKEN belum diisi.");
  process.exit(1);
}

if (!webhookUrl) {
  console.error("TELEGRAM_WEBHOOK_URL belum diisi.");
  console.error("Contoh: TELEGRAM_WEBHOOK_URL=https://nama-project.vercel.app/api/telegram/webhook");
  process.exit(1);
}

const webhookPayload = {
  url: webhookUrl,
  allowed_updates: ["message"],
  drop_pending_updates: false,
};

if (webhookSecret) {
  webhookPayload.secret_token = webhookSecret;
}

await postTelegram(token, "setWebhook", webhookPayload);

await postTelegram(token, "setMyCommands", { commands: BOT_COMMANDS });
await postTelegram(token, "setChatMenuButton", {
  menu_button: { type: "commands" },
});

console.log("Webhook Telegram sudah aktif.");
console.log(`URL: ${webhookUrl}`);
console.log(`Secret header: ${webhookSecret ? "aktif" : "tidak aktif"}`);

function getWebhookUrl() {
  if (process.env.TELEGRAM_WEBHOOK_URL) {
    return process.env.TELEGRAM_WEBHOOK_URL;
  }

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  if (!vercelHost) {
    return "";
  }

  return `https://${vercelHost.replace(/^https?:\/\//, "")}/api/telegram/webhook`;
}
