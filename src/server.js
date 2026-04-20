import express from "express";
import "dotenv/config";
import {
  deleteLastTransaction,
  getDatabaseStatus,
  getSummary,
  initializeDatabase,
  listTransactions,
  openDatabase,
  saveTransactions,
  shouldInitializeDatabaseAtRuntime,
} from "./database.js";
import { handleMessage } from "./message-handler.js";
import { parseInput } from "./parser.js";
import { requireAdmin } from "./security.js";

const app = express();
const port = process.env.PORT || 3000;
const database = openDatabase(process.env.DATABASE_PATH);
const databaseReady = shouldInitializeDatabaseAtRuntime()
  ? initializeDatabase(database)
  : Promise.resolve();

app.use(express.json());

app.get("/", (req, res) => {
  res.type("text").send(
    [
      "Telegram Finance Bot is running.",
      "",
      "Available endpoint:",
      "- GET /health",
      "",
      "Admin endpoints require a token:",
      "- GET /database/status",
      "- POST /simulate",
      "- POST /messages",
      "- POST /transactions",
      "- GET /transactions",
      "- GET /summary",
      "- DELETE /transactions/last",
      "",
      "Keep the npm run dev terminal open while testing localhost.",
    ].join("\n"),
  );
});

app.get("/health", async (req, res) => {
  res.json({
    ok: true,
    service: "telegram-finance-bot",
    message: "Server hidup.",
  });
});

app.get("/database/status", requireAdmin, async (req, res) => {
  await databaseReady;
  res.json(await getDatabaseStatus(database));
});

app.post("/simulate", requireAdmin, (req, res) => {
  const message = req.body?.message;
  const result = parseInput(message);
  const statusCode = result.ok ? 200 : 400;

  res.status(statusCode).json(result);
});

app.post("/messages", requireAdmin, async (req, res) => {
  await databaseReady;
  const result = await handleMessage(database, req.body?.message);
  const statusCode = result.ok ? 200 : 400;

  res.status(statusCode).json(result);
});

app.post("/transactions", requireAdmin, async (req, res) => {
  await databaseReady;
  const message = req.body?.message;
  const parsed = parseInput(message);

  if (!parsed.ok) {
    res.status(400).json(parsed);
    return;
  }

  if (parsed.kind === "command") {
    res.status(422).json({
      ok: false,
      kind: "error",
      error: "Command belum disimpan sebagai transaksi. Gunakan input nominal.",
      parsed,
    });
    return;
  }

  const transactions =
    parsed.kind === "batch" ? parsed.transactions : [parsed.transaction];
  const saved = await saveTransactions(database, transactions);

  res.status(201).json({
    ok: true,
    kind: parsed.kind,
    saved,
    count: saved.length,
    summary: await getSummary(database),
  });
});

app.get("/transactions", requireAdmin, async (req, res) => {
  await databaseReady;
  res.json({
    ok: true,
    transactions: await listTransactions(database, {
      limit: req.query.limit,
      offset: req.query.offset,
    }),
  });
});

app.get("/summary", requireAdmin, async (req, res) => {
  await databaseReady;
  res.json({
    ok: true,
    summary: await getSummary(database),
  });
});

app.delete("/transactions/last", requireAdmin, async (req, res) => {
  await databaseReady;
  const deleted = await deleteLastTransaction(database);

  if (!deleted) {
    res.status(404).json({
      ok: false,
      kind: "error",
      error: "Belum ada transaksi yang bisa dihapus.",
    });
    return;
  }

  res.json({
    ok: true,
    deleted,
    summary: await getSummary(database),
  });
});

app.listen(port, () => {
  console.log(`Telegram Finance Bot running at http://localhost:${port}`);
});
