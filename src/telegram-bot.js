import "dotenv/config";
import { initializeDatabase, openDatabase } from "./database.js";
import {
  configureTelegramMenu,
  parseAllowedChatIds,
  processTelegramUpdate,
  telegramUrl,
} from "./telegram-service.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const database = openDatabase(process.env.DATABASE_PATH);
const pollIntervalMs = Number(process.env.TELEGRAM_POLL_INTERVAL_MS ?? 1200);
const allowedChatIds = parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS);

await initializeDatabase(database);

if (!token || token === "isi_token_baru_dari_botfather") {
  console.error("TELEGRAM_BOT_TOKEN belum diisi.");
  console.error("Buat file .env dari .env.example, lalu isi token baru dari BotFather.");
  process.exit(1);
}

let offset = 0;
let running = true;

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Keuangan Telegram bot berjalan.");
if (allowedChatIds.size > 0) {
  console.log(`Akses dibatasi untuk ${allowedChatIds.size} chat ID.`);
} else {
  console.log("Akses belum dibatasi. Isi TELEGRAM_ALLOWED_CHAT_IDS di .env.");
}
console.log("Tekan Ctrl + C untuk berhenti.");

await setupPollingMode();
await configureMenuSafely();

while (running) {
  try {
    const updates = await getUpdates(offset);

    for (const update of updates) {
      offset = update.update_id + 1;
      await processTelegramUpdate({ database, update, token, allowedChatIds });
    }
  } catch (error) {
    console.error("Gagal polling Telegram:", error.message);
    await sleep(3000);
  }

  await sleep(pollIntervalMs);
}

await database.close();

async function setupPollingMode() {
  try {
    const response = await fetch(telegramUrl(token, "deleteWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    const body = await response.json();

    if (!body.ok) {
      throw new Error(body.description ?? "deleteWebhook gagal.");
    }
  } catch (error) {
    console.warn("Webhook lama belum bisa dinonaktifkan:", error.message);
  }
}

async function configureMenuSafely() {
  try {
    await configureTelegramMenu(token);
    console.log("Menu command Telegram sudah dikonfigurasi.");
  } catch (error) {
    console.warn("Menu command Telegram belum bisa dikonfigurasi:", error.message);
  }
}

async function getUpdates(currentOffset) {
  const response = await fetch(telegramUrl(token, "getUpdates"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      offset: currentOffset,
      timeout: 20,
      allowed_updates: ["message"],
    }),
  });
  const body = await response.json();

  if (!body.ok) {
    throw new Error(body.description ?? "Telegram getUpdates gagal.");
  }

  return body.result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shutdown() {
  running = false;
  console.log("\nMenghentikan bot Telegram...");
}
