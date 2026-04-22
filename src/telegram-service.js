import { handleMessage } from "./message-handler.js";
import {
  clearAllTransactions,
  clearBudgets,
  clearChatSessionMode,
  clearChatSessionPendingAction,
  getChatSession,
  getSummary,
  listTransactions,
  setChatSessionMode,
  setChatSessionPendingAction,
} from "./database.js";

export const removeKeyboard = { remove_keyboard: true };

export const mainKeyboard = {
  keyboard: [
    [{ text: "Insight AI" }, { text: "Tanya AI" }, { text: "Budget" }],
    [{ text: "Input Pemasukan" }, { text: "Input Pengeluaran" }],
    [{ text: "Saldo" }, { text: "Riwayat" }],
    [{ text: "Hari Ini" }, { text: "Kategori" }],
    [{ text: "Export CSV" }, { text: "Hapus Terakhir" }],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
  is_persistent: false,
  input_field_placeholder: "Ketik +500k gaji atau -20k bensin",
};

export const BOT_COMMANDS = [
  { command: "start", description: "Mulai bot dan lihat contoh format" },
  { command: "pemasukan", description: "Input pemasukan tanpa tanda +" },
  { command: "pengeluaran", description: "Input pengeluaran tanpa tanda -" },
  { command: "saldo", description: "Cek saldo saat ini" },
  { command: "hariini", description: "Laporan hari ini" },
  { command: "mingguini", description: "Laporan minggu ini" },
  { command: "bulanini", description: "Laporan bulan ini" },
  { command: "riwayat", description: "Lihat transaksi terakhir" },
  { command: "kategori", description: "Lihat ringkasan kategori" },
  { command: "insight", description: "Insight keuangan read-only" },
  { command: "tanya", description: "Tanya AI soal data keuangan" },
  { command: "budget", description: "Cek atau atur budget" },
  { command: "cari", description: "Cari transaksi, contoh: /cari bensin" },
  { command: "hapusterakhir", description: "Hapus transaksi terakhir" },
  { command: "export", description: "Export CSV" },
  { command: "reset", description: "Reset semua transaksi" },
  { command: "help", description: "Lihat bantuan format" },
  { command: "batal", description: "Batalkan mode input" },
  { command: "id", description: "Lihat chat ID Telegram" },
  { command: "stop", description: "Sembunyikan keyboard lama" },
];

const BUTTON_COMMANDS = new Map([
  ["input pemasukan", "input_income"],
  ["input pengeluaran", "input_expense"],
  ["saldo", "saldo"],
  ["hari ini", "hari ini"],
  ["riwayat", "riwayat"],
  ["kategori", "kategori"],
  ["insight ai", "insight"],
  ["tanya ai", "ask_prompt"],
  ["budget", "budget"],
  ["bantuan", "help"],
  ["export csv", "export csv"],
  ["hapus terakhir", "hapus terakhir"],
  ["reset", "reset_data"],
  ["reset data", "reset_data"],
  ["reset budget", "reset_budget"],
]);

export async function processTelegramUpdate({ database, update, token, allowedChatIds }) {
  const message = update?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;

  if (!chatId || !text) {
    return { handled: false, reason: "ignored_non_text_message" };
  }

  const normalizedText = normalizeTelegramCommand(text);

  if (normalizedText === "/id") {
    await sendTelegramMessage(token, chatId, `Chat ID kamu: ${chatId}`);
    return { handled: true, kind: "id" };
  }

  if (!isAllowedChat(chatId, allowedChatIds)) {
    await sendTelegramMessage(token, chatId, "Maaf, bot ini hanya untuk pemilik.");
    return { handled: true, kind: "blocked" };
  }

  if (normalizedText === "/start") {
    await clearChatSessionMode(database, chatId);
    await clearChatSessionPendingAction(database, chatId);
    await sendTelegramMessage(token, chatId, buildStartReply(), { replyMarkup: mainKeyboard });
    return { handled: true, kind: "start" };
  }

  if (normalizedText === "/stop") {
    await clearChatSessionMode(database, chatId);
    await clearChatSessionPendingAction(database, chatId);
    await sendTelegramMessage(token, chatId, buildStopReply(), { replyMarkup: removeKeyboard });
    return { handled: true, kind: "stop" };
  }

  if (normalizedText === "/batal") {
    await clearChatSessionMode(database, chatId);
    await clearChatSessionPendingAction(database, chatId);
    await sendTelegramMessage(token, chatId, "Mode input dibatalkan.", { replyMarkup: mainKeyboard });
    return { handled: true, kind: "cancel" };
  }

  if (normalizedText === "ask_prompt") {
    await sendTelegramMessage(token, chatId, buildAskPrompt(), { replyMarkup: mainKeyboard });
    return { handled: true, kind: "ask_prompt" };
  }

  if (normalizedText === "reset_data") {
    await clearChatSessionMode(database, chatId);
    await setChatSessionPendingAction(database, chatId, "reset_confirm");
    await sendTelegramMessage(token, chatId, buildResetPrompt(), { replyMarkup: mainKeyboard });
    return { handled: true, kind: "reset_requested" };
  }

  if (normalizedText === "reset_budget" || normalizedText === "reset budget") {
    await clearChatSessionMode(database, chatId);
    await setChatSessionPendingAction(database, chatId, "budget_reset_confirm");
    await sendTelegramMessage(token, chatId, buildBudgetResetPrompt(), { replyMarkup: mainKeyboard });
    return { handled: true, kind: "budget_reset_requested" };
  }

  const activeSession = await getChatSession(database, chatId);
  if (activeSession?.pendingAction === "reset_confirm") {
    const result = await handlePendingResetAction(database, token, chatId, text);
    return { handled: true, kind: "reset_confirmation", result };
  }

  if (activeSession?.pendingAction === "budget_reset_confirm") {
    const result = await handlePendingBudgetResetAction(database, token, chatId, text);
    return { handled: true, kind: "budget_reset_confirmation", result };
  }

  if (activeSession?.pendingAction === "transaction_clarify") {
    await clearChatSessionPendingAction(database, chatId);
    await sendTelegramMessage(
      token,
      chatId,
      [
        "Klarifikasi transaksi dibatalkan.",
        "",
        "Pilih /pemasukan atau /pengeluaran, lalu kirim ulang transaksi tanpa tanda.",
      ].join("\n"),
      { replyMarkup: mainKeyboard },
    );
    return { handled: true, kind: "transaction_clarification_cancelled" };
  }

  if (normalizedText === "input_income" || normalizedText === "input_expense") {
    const mode = normalizedText === "input_income" ? "income" : "expense";
    await setChatSessionMode(database, chatId, mode);
    await sendTelegramMessage(token, chatId, buildInputModePrompt(mode), { replyMarkup: mainKeyboard });
    return { handled: true, kind: "input_mode", mode };
  }

  const effective = await applyPendingInputMode(database, chatId, normalizedText);
  const result = await handleMessage(database, effective.text, {
    chatId,
    defaultTransactionType: effective.defaultTransactionType,
  });

  if (result.kind === "clarification") {
    await setChatSessionPendingAction(database, chatId, "transaction_clarify");
  }

  if (result.command === "export" && result.csv) {
    await sendTelegramDocument(token, chatId, result.filename ?? "telegram-finance-bot.csv", result.csv, {
      caption: result.reply,
      replyMarkup: mainKeyboard,
    });
  } else {
    await sendTelegramMessage(token, chatId, result.reply, { replyMarkup: mainKeyboard });
  }

  return { handled: true, kind: "message", result };
}

export async function sendTelegramMessage(token, chatId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    text,
  };

  if (options.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }

  return postTelegram(token, "sendMessage", payload);
}

export async function sendTelegramDocument(token, chatId, filename, content, options = {}) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set(
    "document",
    new Blob([content], { type: "text/csv;charset=utf-8" }),
    filename,
  );

  if (options.caption) {
    form.set("caption", options.caption);
  }

  if (options.replyMarkup) {
    form.set("reply_markup", JSON.stringify(options.replyMarkup));
  }

  const response = await fetch(telegramUrl(token, "sendDocument"), {
    method: "POST",
    body: form,
  });
  const body = await response.json();

  if (!body.ok) {
    throw new Error(body.description ?? "sendDocument gagal.");
  }

  return body.result;
}

export async function configureTelegramMenu(token) {
  await postTelegram(token, "setMyCommands", { commands: BOT_COMMANDS });
  await postTelegram(token, "setChatMenuButton", {
    menu_button: { type: "commands" },
  });
}

export async function postTelegram(token, method, payload) {
  const response = await fetch(telegramUrl(token, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();

  if (!body.ok) {
    throw new Error(body.description ?? `${method} gagal.`);
  }

  return body.result;
}

export function telegramUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

export function parseAllowedChatIds(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function normalizeTelegramCommand(text) {
  const trimmed = String(text ?? "").trim();
  const buttonCommand = BUTTON_COMMANDS.get(trimmed.toLowerCase());

  if (buttonCommand) {
    return buttonCommand;
  }

  const commands = {
    "/help": "help",
    "/menu": "help",
    "/batal": "/batal",
    "/pemasukan": "input_income",
    "/pengeluaran": "input_expense",
    "/saldo": "saldo",
    "/hariini": "hari ini",
    "/mingguini": "minggu ini",
    "/bulanini": "bulan ini",
    "/riwayat": "riwayat",
    "/kategori": "kategori",
    "/insight": "insight",
    "/tanya": "ask_prompt",
    "/budget": "budget",
    "/hapusterakhir": "hapus terakhir",
    "/export": "export csv",
    "/reset": "reset_data",
  };

  if (commands[trimmed]) {
    return commands[trimmed];
  }

  if (trimmed.toLowerCase().startsWith("/tanya ")) {
    return `tanya ${trimmed.slice(7).trim()}`;
  }

  return trimmed;
}

export function isAllowedChat(chatId, allowedChatIds) {
  if (!allowedChatIds || allowedChatIds.size === 0) {
    return true;
  }

  return allowedChatIds.has(String(chatId));
}

async function applyPendingInputMode(database, chatId, text) {
  const session = await getChatSession(database, chatId);
  const mode = session?.pendingInputMode;

  if (!mode) {
    return { text, defaultTransactionType: null };
  }

  await clearChatSessionMode(database, chatId);

  if (isCommandText(text) || String(text).trim().startsWith("/")) {
    return { text, defaultTransactionType: null };
  }

  if (/^[+-]/.test(text)) {
    return { text, defaultTransactionType: null };
  }

  return { text, defaultTransactionType: mode };
}

async function handlePendingResetAction(database, token, chatId, text) {
  const normalized = String(text ?? "").trim().toUpperCase();

  if (normalized !== "YA RESET") {
    await sendTelegramMessage(
      token,
      chatId,
      [
        "Konfirmasi reset belum cocok.",
        "",
        "Ketik persis:",
        "YA RESET",
        "",
        "Atau ketik /batal untuk membatalkan.",
      ].join("\n"),
      { replyMarkup: mainKeyboard },
    );

    return { ok: false, kind: "reset_confirmation_pending" };
  }

  const result = await clearAllTransactions(database);
  const summary = await getSummary(database);
  await clearChatSessionPendingAction(database, chatId);

  const reply =
    result.deletedCount > 0
      ? [
          "Semua transaksi berhasil direset.",
          "",
          `Jumlah yang dihapus: ${result.deletedCount}`,
          `Saldo sekarang: ${formatRupiah(summary.balance)}`,
        ].join("\n")
      : "Tidak ada transaksi yang perlu direset.";

  await sendTelegramMessage(token, chatId, reply, { replyMarkup: mainKeyboard });

  return {
    ok: true,
    deletedCount: result.deletedCount,
  };
}

async function handlePendingBudgetResetAction(database, token, chatId, text) {
  const normalized = String(text ?? "").trim().toUpperCase();

  if (normalized !== "YA RESET BUDGET") {
    await sendTelegramMessage(
      token,
      chatId,
      [
        "Konfirmasi reset budget belum cocok.",
        "",
        "Ketik persis:",
        "YA RESET BUDGET",
        "",
        "Atau ketik /batal untuk membatalkan.",
      ].join("\n"),
      { replyMarkup: mainKeyboard },
    );

    return { ok: false, kind: "budget_reset_confirmation_pending" };
  }

  const result = await clearBudgets(database, chatId);
  await clearChatSessionPendingAction(database, chatId);

  const reply =
    result.deletedCount > 0
      ? [
          "Semua budget berhasil direset.",
          "",
          `Jumlah yang dihapus: ${result.deletedCount}`,
        ].join("\n")
      : "Tidak ada budget yang perlu direset.";

  await sendTelegramMessage(token, chatId, reply, { replyMarkup: mainKeyboard });

  return {
    ok: true,
    deletedCount: result.deletedCount,
  };
}

function buildStartReply() {
  return [
    "Keuangan Telegram siap.",
    "",
    "Pakai tombol cepat di bawah chat atau menu command Telegram.",
    "",
    "Alur utama:",
    "Input Pemasukan -> 500k gaji",
    "Input Pengeluaran -> 20k bensin",
    "",
    "Tanda cepat juga tetap bisa:",
    "-20k bensin",
    "+500k gaji",
    "",
    "Command ringkas:",
    "saldo",
    "hari ini",
    "riwayat",
    "insight",
  ].join("\n");
}

function buildStopReply() {
  return [
    "Keyboard cepat disembunyikan.",
    "",
    "Bot tetap bisa dipakai lewat menu command atau pesan manual.",
  ].join("\n");
}

function buildInputModePrompt(mode) {
  const label = mode === "income" ? "pemasukan" : "pengeluaran";
  const example = mode === "income" ? "500k gaji" : "20k bensin";
  const sign = mode === "income" ? "+" : "-";

  return [
    `Mode ${label} aktif.`,
    "",
    `Kirim nominal dan catatan tanpa tanda ${sign}.`,
    `Contoh: ${example}`,
    "Ketik /batal untuk membatalkan.",
  ].join("\n");
}

function buildAskPrompt() {
  return [
    "Ketik pertanyaan setelah /tanya.",
    "",
    "Contoh:",
    "/tanya bulan ini boros di mana?",
    "/tanya berapa total bensin bulan ini?",
  ].join("\n");
}

function buildResetPrompt() {
  return [
    "Kamu akan menghapus semua transaksi.",
    "",
    "Untuk lanjut, ketik persis:",
    "YA RESET",
    "",
    "Ketik /batal kalau berubah pikiran.",
  ].join("\n");
}

function buildBudgetResetPrompt() {
  return [
    "Kamu akan menghapus semua budget.",
    "",
    "Untuk lanjut, ketik persis:",
    "YA RESET BUDGET",
    "",
    "Ketik /batal kalau berubah pikiran.",
  ].join("\n");
}

function isCommandText(text) {
  return [
    "saldo",
    "hari ini",
    "minggu ini",
    "bulan ini",
    "riwayat",
    "kategori",
    "insight",
    "budget",
    "hapus terakhir",
    "export csv",
    "reset_data",
    "help",
  ].includes(text);
}

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
