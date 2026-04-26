import { handleMessage } from "./message-handler.js";
import {
  clearAllTransactions,
  clearBudgets,
  clearChatSessionMode,
  clearChatSessionPendingAction,
  getChatSession,
  getSummary,
  listTransactions,
  listWallets,
  saveTransactions,
  setChatSessionMode,
  setChatSessionPendingAction,
} from "./database.js";

export const removeKeyboard = { remove_keyboard: true };

export const mainKeyboard = {
  keyboard: [
    [{ text: "Insight AI" }, { text: "Tanya AI" }, { text: "Budget" }],
    [{ text: "Laporan AI" }, { text: "Review AI" }, { text: "Anomali" }],
    [{ text: "Input Pemasukan" }, { text: "Input Pengeluaran" }],
    [{ text: "Saldo" }, { text: "Riwayat" }],
    [{ text: "Hari Ini" }, { text: "Kategori" }],
    [{ text: "Export CSV" }, { text: "Hapus Terakhir" }],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
  is_persistent: false,
  input_field_placeholder: "Ketik 500k gaji atau 20k bensin",
};

export const BOT_COMMANDS = [
  { command: "start", description: "Mulai bot dan lihat contoh format" },
  { command: "pemasukan", description: "Input pemasukan natural" },
  { command: "pengeluaran", description: "Input pengeluaran natural" },
  { command: "saldo", description: "Cek saldo saat ini" },
  { command: "hariini", description: "Laporan hari ini" },
  { command: "mingguini", description: "Laporan minggu ini" },
  { command: "bulanini", description: "Laporan bulan ini" },
  { command: "riwayat", description: "Lihat transaksi terakhir" },
  { command: "kategori", description: "Lihat ringkasan kategori" },
  { command: "insight", description: "Insight keuangan read-only" },
  { command: "tanya", description: "Tanya AI soal data keuangan" },
  { command: "laporanai", description: "Laporan mingguan AI" },
  { command: "reviewai", description: "Review bulanan AI" },
  { command: "anomali", description: "Cek anomali transaksi" },
  { command: "budget", description: "Cek atau atur budget" },
  { command: "dompet", description: "Lihat ringkasan dompet" },
  { command: "tagihan", description: "Lihat reminder tagihan" },
  { command: "cari", description: "Cari transaksi, contoh: /cari bensin" },
  { command: "hapusterakhir", description: "Hapus transaksi terakhir" },
  { command: "undo", description: "Batalkan hapus transaksi terakhir" },
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
  ["laporan ai", "laporan ai minggu ini"],
  ["review ai", "review ai bulan ini"],
  ["anomali", "cek anomali"],
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
    const result = await handlePendingTransactionClarification(database, token, chatId, text, activeSession);
    return { handled: true, kind: "transaction_clarification", result };
  }

  if (activeSession?.pendingAction === "wallet_select_clarify") {
    const result = await handlePendingWalletSelection(database, token, chatId, text, activeSession);
    return { handled: true, kind: "wallet_selection", result };
  }

  if (activeSession?.pendingAction === "wallet_action_clarify") {
    await clearChatSessionPendingAction(database, chatId);
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
    logger: createPerformanceLogger(),
  });

  if (result.kind === "clarification") {
    const pending = result.pendingClarification;
    const action = pending?.action === "wallet_select_clarify"
      ? "wallet_select_clarify"
      : pending?.action === "wallet_action_clarify"
        ? "wallet_action_clarify"
        : "transaction_clarify";

    await setChatSessionPendingAction(database, chatId, action, action === "transaction_clarify"
      ? { candidates: result.pendingClarification }
      : pending);
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
    "/undo": "undo",
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

async function handlePendingTransactionClarification(database, token, chatId, text, session) {
  const type = parseClarifiedTransactionType(text);
  const candidates = Array.isArray(session?.pendingPayload?.candidates)
    ? session.pendingPayload.candidates
    : [];

  if (type === "cancel") {
    await clearChatSessionPendingAction(database, chatId);
    await sendTelegramMessage(token, chatId, "Oke, tidak ada transaksi yang disimpan.", { replyMarkup: mainKeyboard });
    return { ok: true, kind: "transaction_clarification_cancelled" };
  }

  if (!type) {
    await sendTelegramMessage(
      token,
      chatId,
      [
        "Pilih salah satu:",
        "1. Pengeluaran",
        "2. Pemasukan",
        "3. Bukan transaksi",
        "",
        "Ketik /batal untuk membatalkan.",
      ].join("\n"),
      { replyMarkup: mainKeyboard },
    );

    return { ok: false, kind: "transaction_clarification_pending" };
  }

  if (candidates.length === 0) {
    await clearChatSessionPendingAction(database, chatId);
    await sendTelegramMessage(
      token,
      chatId,
      "Klarifikasi sudah kedaluwarsa. Kirim ulang transaksinya.",
      { replyMarkup: mainKeyboard },
    );

    return { ok: false, kind: "transaction_clarification_missing" };
  }

  const transactions = [];

  for (const candidate of candidates.slice(0, 10)) {
    const transaction = buildClarifiedTransaction(candidate, type);

    if (!transaction) {
      await sendTelegramMessage(
        token,
        chatId,
        "Klarifikasi belum valid. Kirim ulang transaksi dengan nominal dan catatan yang jelas.",
        { replyMarkup: mainKeyboard },
      );

      return { ok: false, kind: "transaction_clarification_invalid" };
    }

    transactions.push(transaction);
  }

  const saved = await saveTransactions(database, transactions);
  const summary = await getSummary(database);
  await clearChatSessionPendingAction(database, chatId);

  const label = type === "income" ? "pemasukan" : "pengeluaran";
  await sendTelegramMessage(
    token,
    chatId,
    [
      `Klarifikasi dipakai: ${label}.`,
      "",
      saved.length === 1 ? "Tersimpan: 1 transaksi" : `Tersimpan: ${saved.length} transaksi`,
      `Saldo: ${formatRupiah(summary.balance)}`,
    ].join("\n"),
    { replyMarkup: mainKeyboard },
  );

  return {
    ok: true,
    kind: "transaction_clarified",
    saved,
    summary,
  };
}

async function handlePendingWalletSelection(database, token, chatId, text, session) {
  const transaction = session?.pendingPayload?.transaction;
  const wallets = Array.isArray(session?.pendingPayload?.wallets) ? session.pendingPayload.wallets : [];
  const normalized = String(text ?? "").trim().toLowerCase();

  if (!transaction) {
    await clearChatSessionPendingAction(database, chatId);
    await sendTelegramMessage(token, chatId, "Klarifikasi dompet sudah kedaluwarsa. Kirim ulang transaksi.", { replyMarkup: mainKeyboard });
    return { ok: false, kind: "wallet_selection_missing" };
  }

  const walletChoice = normalized === "tanpa dompet"
    ? null
    : wallets.find((wallet) => wallet.toLowerCase() === normalized);

  if (normalized !== "tanpa dompet" && !walletChoice) {
    await sendTelegramMessage(
      token,
      chatId,
      ["Balas dengan nama dompet yang tersedia atau `tanpa dompet`.", "", ...wallets.map((wallet) => `- ${wallet}`), "/batal"].join("\n"),
      { replyMarkup: mainKeyboard },
    );
    return { ok: false, kind: "wallet_selection_pending" };
  }

  const transactionToSave = {
    ...transaction,
    wallet: walletChoice ?? null,
  };
  if (!isValidTransaction(transactionToSave)) {
    await sendTelegramMessage(token, chatId, "Klarifikasi dompet belum valid. Kirim ulang transaksinya.", { replyMarkup: mainKeyboard });
    return { ok: false, kind: "wallet_selection_invalid" };
  }

  const saved = await saveTransactions(database, [transactionToSave]);
  const summary = await getSummary(database);
  await clearChatSessionPendingAction(database, chatId);
  await sendTelegramMessage(token, chatId, [
    `Pengeluaran dicatat${walletChoice ? ` dari dompet ${walletChoice}` : " tanpa dompet"}.`,
    "",
    "Tersimpan: 1 transaksi",
    `Saldo: ${formatSimpleRupiah(summary.balance)}`,
  ].join("\n"), { replyMarkup: mainKeyboard });

  return { ok: true, kind: "wallet_selection_saved", saved, summary };
}

function formatSimpleRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function buildClarifiedTransaction(candidate, type) {
  const amount = Number(candidate?.amount);
  const note = String(candidate?.note ?? "").trim();
  const category = String(candidate?.category ?? (type === "income" ? "income" : "other")).trim() || "other";
  const confidence = Math.min(0.96, Number(candidate?.confidence ?? 0.75));
  const transaction = {
    type,
    amount,
    note,
    category,
    wallet: normalizeWalletName(candidate?.wallet),
    paymentMethod: null,
    date: null,
    tags: [],
    rawAmount: String(amount),
    original: candidate?.original ?? `${amount} ${note}`,
    confidence,
  };

  return isValidTransaction(transaction) ? transaction : null;
}

function isValidTransaction(transaction) {
  return (
    (transaction?.type === "income" || transaction?.type === "expense")
    && Number.isSafeInteger(transaction.amount)
    && transaction.amount > 0
    && Boolean(String(transaction.note ?? "").trim())
    && Boolean(String(transaction.category ?? "").trim())
  );
}

function normalizeWalletName(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return normalized || null;
}

function parseClarifiedTransactionType(text) {
  const normalized = String(text ?? "").trim().toLowerCase();

  if (["2", "pemasukan", "/pemasukan", "income", "masuk", "input pemasukan"].includes(normalized)) {
    return "income";
  }

  if (["1", "pengeluaran", "/pengeluaran", "expense", "keluar", "input pengeluaran"].includes(normalized)) {
    return "expense";
  }

  if (["3", "bukan transaksi", "batal", "cancel"].includes(normalized)) {
    return "cancel";
  }

  return null;
}

function buildStartReply() {
  return [
    "Keuangan Telegram siap.",
    "",
    "Pakai tombol cepat di bawah chat atau menu command Telegram.",
    "",
    "Alur utama:",
    "Kirim pesan natural seperti: bensin 20k pakai cash",
    "Kalau ambigu, bot akan memberi pilihan 1/2/3.",
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
  return [
    `Mode ${label} aktif.`,
    "",
    "Kirim nominal dan catatan dalam bahasa natural.",
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

function createPerformanceLogger() {
  if (process.env.PERF_LOGS !== "1") {
    return null;
  }

  return {
    info(payload) {
      console.info(JSON.stringify(payload));
    },
  };
}
