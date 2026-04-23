import "dotenv/config";
import { initializeDatabase, openDatabase } from "../src/database.js";
import { handleMessage } from "../src/message-handler.js";

const database = openDatabase(process.env.DATABASE_PATH);
await initializeDatabase(database);

try {
  const chatId = resolveChatId();
  const result = await handleMessage(database, "review ai bulan ini", { chatId });

  console.log(`Monthly AI review chat: ${chatId}`);
  console.log(result.reply);
} finally {
  await database.close();
}

function resolveChatId() {
  const direct = String(process.env.REPORT_CHAT_ID ?? "").trim();
  if (direct) {
    return direct;
  }

  const allowed = String(process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .find(Boolean);

  return allowed || "local-report";
}
