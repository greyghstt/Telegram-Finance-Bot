import {
  initializeDatabase,
  openDatabase,
  shouldInitializeDatabaseAtRuntime,
} from "../../src/database.js";
import { hasValidTelegramWebhookSecret } from "../../src/security.js";
import { parseAllowedChatIds, processTelegramUpdate } from "../../src/telegram-service.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatIds = parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
const database = openDatabase();
let databaseReadyPromise = null;

async function ensureDatabaseReady() {
  if (!shouldInitializeDatabaseAtRuntime()) {
    return;
  }

  if (!databaseReadyPromise) {
    databaseReadyPromise = initializeDatabase(database).catch((error) => {
      databaseReadyPromise = null;
      console.error("Database runtime init error:", error?.code ?? error?.message ?? error);
      throw error;
    });
  }

  await databaseReadyPromise;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "telegram-finance-bot-webhook" });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!token) {
    res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN belum diset." });
    return;
  }

  if (!hasValidTelegramWebhookSecret(req)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  try {
    await ensureDatabaseReady();
    const update = parseRequestBody(req.body);
    await processTelegramUpdate({ database, update, token, allowedChatIds });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    res.status(500).json({ ok: false, error: "Webhook gagal diproses." });
  }
}

function parseRequestBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    return JSON.parse(body);
  }

  return body;
}

