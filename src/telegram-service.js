import { createHash } from "node:crypto";
import {
  clearAllTransactions,
  clearBudgets,
  clearChatSessionPendingAction,
  getChatSession,
  getSummary,
  getWalletBalances,
  saveTransactions,
  saveWalletBalanceEntry,
  setChatSessionMode,
  setChatSessionPendingAction,
} from "./database.js";
import { handleMessage } from "./message-handler.js";

export const mainKeyboard = {
  keyboard: [
    [{ text: "Saldo" }, { text: "Hari ini" }],
    [{ text: "Riwayat" }, { text: "Kategori" }],
    [{ text: "Insight" }, { text: "Budget" }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
  is_persistent: true,
  input_field_placeholder: "Contoh: bensin 20k atau gaji 500k",
};

export const BOT_COMMANDS = [
  { command: "start", description: "Mulai bot dan lihat bantuan" },
  { command: "pemasukan", description: "Input pemasukan natural" },
  { command: "pengeluaran", description: "Input pengeluaran natural" },
  { command: "saldo", description: "Cek saldo saat ini" },
  { command: "riwayat", description: "Lihat riwayat transaksi" },
  { command: "kategori", description: "Lihat ringkasan per kategori" },
  { command: "insight", description: "Insight AI dari transaksi" },
  { command: "tanya", description: "Tanya AI tentang keuangan" },
  { command: "budget", description: "Kelola budget" },
  { command: "dompet", description: "Kelola dompet" },
  { command: "tagihan", description: "Kelola tagihan" },
  { command: "cari", description: "Cari transaksi" },
  { command: "laporanai", description: "Laporan AI mingguan" },
  { command: "reviewai", description: "Review AI bulanan" },
  { command: "anomali", description: "Deteksi anomali AI" },
  { command: "undo", description: "Batalkan hapus terakhir" },
  { command: "reset", description: "Reset semua data" },
  { command: "stop", description: "Hentikan bot" },
  { command: "batal", description: "Batalkan aksi pending" },
];

export function normalizeTelegramCommand(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed.startsWith("/")) {
    return trimmed;
  }

  const withoutSlash = trimmed.slice(1);
  const atIndex = withoutSlash.indexOf("@");
  const command = atIndex === -1 ? withoutSlash : withoutSlash.slice(0, atIndex);

  const canonical = {
    start: "start",
    stop: "stop",
    pemasukan: "input_income",
    pengeluaran: "input_expense",
    saldo: "saldo",
    riwayat: "riwayat",
    kategori: "kategori",
    insight: "insight",
    tanya: "tanya",
    budget: "budget",
    dompet: "dompet",
    tagihan: "tagihan",
    cari: "cari",
    laporanai: "laporanai",
    reviewai: "reviewai",
    anomali: "anomali",
    undo: "undo",
    reset: "reset",
    batal: "batal",
  };

  return canonical[command.toLowerCase()] ?? command;
}

export function parseAllowedChatIds(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export async function processTelegramUpdate({ database, update, token, allowedChatIds = new Set(), env = process.env }) {
  const message = update?.message;
  if (!message?.text) {
    return { handled: false };
  }

  const chatId = message.chat.id;
  if (!isChatAllowed(chatId, allowedChatIds, env)) {
    if (chatId !== 0) {
      await sendTelegramMessage(token, chatId, "Bot ini hanya untuk pemilik.", { replyMarkup: mainKeyboard });
    }
    return { handled: true, kind: "blocked" };
  }

  const text = message.text.trim();
  const normalizedText = normalizeTelegramCommand(text);
  const lowerText = text.toLowerCase();
  const effectiveCommand = lowerText === "input pemasukan"
    ? "input_income"
    : lowerText === "input pengeluaran"
      ? "input_expense"
      : normalizedText;

  if (effectiveCommand === "start") {
    await sendTelegramMessage(token, chatId, buildStartReply(), { replyMarkup: mainKeyboard });
    return { handled: true, kind: "start" };
  }

  if (effectiveCommand === "stop") {
    await sendTelegramMessage(token, chatId, buildStopReply(), { replyMarkup: mainKeyboard });
    return { handled: true, kind: "stop" };
  }

  if (effectiveCommand === "batal") {
    await clearChatSessionPendingAction(database, chatId);
    await sendTelegramMessage(token, chatId, "Dibatalkan.", { replyMarkup: mainKeyboard });
    return { handled: true, kind: "cancel" };
  }

  if (effectiveCommand === "reset") {
    const result = await handleMessage(database, "reset", {
      chatId,
      defaultTransactionType: null,
      logger: createPerformanceLogger(),
    });

    if (result.kind === "clarification" && result.pendingClarification?.action === "reset_confirm") {
      await setChatSessionPendingAction(database, chatId, "reset_confirm", result.pendingClarification);
    }

    await sendTelegramMessage(token, chatId, result.reply, { replyMarkup: mainKeyboard });
    return { handled: true, kind: "reset_instruction", result };
  }

  const activeSession = await getChatSession(database, chatId);

  if (activeSession?.pendingAction === "reset_confirm") {
    const result = await handlePendingResetAction(database, token, chatId, text);
    return { handled: true, kind: "reset", result };
  }

  if (activeSession?.pendingAction === "budget_reset_confirm") {
    const result = await handlePendingBudgetResetAction(database, token, chatId, text);
    return { handled: true, kind: "budget_reset", result };
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
    const result = await handlePendingWalletActionClarification(database, token, chatId, text, activeSession);
    return { handled: true, kind: "wallet_action_clarification", result };
  }

  if (effectiveCommand === "input_income" || effectiveCommand === "input_expense") {
    const mode = effectiveCommand === "input_income" ? "income" : "expense";
    await setChatSessionMode(database, chatId, mode);
    await sendTelegramMessage(token, chatId, buildInputModePrompt(mode), { replyMarkup: mainKeyboard });
    return { handled: true, kind: "input_mode", mode };
  }

  const effective = await applyPendingInputMode(database, chatId, effectiveCommand);
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
        : pending?.action === "reset_confirm"
          ? "reset_confirm"
          : pending?.action === "budget_reset_confirm"
            ? "budget_reset_confirm"
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

  if (!response.ok) {
    throw new Error(`Telegram sendDocument failed: ${response.status}`);
  }

  return response.json();
}

function telegramUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function postTelegram(token, method, payload) {
  const response = await fetch(telegramUrl(token, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status}`);
  }

  return response.json();
}

function buildStartReply() {
  return [
    "Keuangan Telegram siap.",
    "",
    "Kirim transaksi dengan bahasa natural.",
    "Contoh: bensin 20k pakai cash",
    "",
    "Command cepat:",
    "saldo",
    "hari ini",
    "riwayat",
    "insight",
  ].join("\n");
}

function buildStopReply() {
  return "Bot dihentikan. Ketik /start untuk mulai lagi.";
}

function buildInputModePrompt(mode) {
  const label = mode === "income" ? "pemasukan" : "pengeluaran";
  return `Mode ${label}. Kirim nominal dan catatan.`;
}

async function applyPendingInputMode(database, chatId, text) {
  const session = await getChatSession(database, chatId);
  const mode = session?.pendingInputMode;

  if (!mode) {
    return { text, defaultTransactionType: null };
  }

  await setChatSessionMode(database, chatId, null);
  return {
    text,
    defaultTransactionType: mode === "income" ? "income" : "expense",
  };
}

function createPerformanceLogger() {
  const startedAt = Date.now();
  const measurements = [];

  return {
    measure(label, fn) {
      const start = Date.now();
      const result = fn();
      measurements.push({ label, ms: Date.now() - start });
      return result;
    },
    async measureAsync(label, fn) {
      const start = Date.now();
      const result = await fn();
      measurements.push({ label, ms: Date.now() - start });
      return result;
    },
    summary() {
      return {
        total: Date.now() - startedAt,
        measurements,
      };
    },
  };
}

async function handlePendingResetAction(database, token, chatId, text) {
  const normalized = String(text ?? "").trim().toUpperCase();

  if (normalized !== "YA RESET") {
    await sendTelegramMessage(
      token,
      chatId,
      [
        "Konfirmasi belum cocok.",
        "",
        "Balas persis:",
        "YA RESET",
        "",
        "Atau ketik /batal.",
      ].join("\n"),
      { replyMarkup: mainKeyboard },
    );

    return { ok: false, kind: "reset_confirmation_mismatch" };
  }

  const result = await clearAllTransactions(database, chatId);
  const summary = await getSummary(database, { chatId });
  await clearChatSessionPendingAction(database, chatId);

  const reply = result.deletedCount > 0
    ? [
        "Data transaksi direset.",
        `Dihapus: ${result.deletedCount}`,
        `Saldo: ${formatRupiah(summary.balance)}`,
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
        "Konfirmasi belum cocok.",
        "",
        "Balas persis:",
        "YA RESET BUDGET",
        "",
        "Atau ketik /batal.",
      ].join("\n"),
      { replyMarkup: mainKeyboard },
    );

    return { ok: false, kind: "budget_reset_confirmation_mismatch" };
  }

  const result = await clearBudgets(database, chatId);
  await clearChatSessionPendingAction(database, chatId);

  await sendTelegramMessage(
    token,
    chatId,
    result.deletedCount > 0
      ? `Budget direset. Dihapus: ${result.deletedCount}`
      : "Tidak ada budget yang perlu direset.",
    { replyMarkup: mainKeyboard },
  );

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
        "Balas:",
        "1. Pengeluaran",
        "2. Pemasukan",
        "3. Bukan transaksi",
        "",
        "Ketik /batal untuk batal.",
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
        "Klarifikasi belum valid. Kirim ulang nominal dan catatan.",
        { replyMarkup: mainKeyboard },
      );

      return { ok: false, kind: "transaction_clarification_invalid" };
    }

    transactions.push(transaction);
  }

  const saved = await saveTransactions(database, transactions.map((transaction) => ({ ...transaction, chatId })));
  const summary = await getSummary(database, { chatId });
  await clearChatSessionPendingAction(database, chatId);

  const label = type === "income" ? "pemasukan" : "pengeluaran";
  await sendTelegramMessage(
    token,
    chatId,
    [
      `Dicatat sebagai ${label}.`,
      saved.length === 1 ? "Tercatat: 1 transaksi" : `Tercatat: ${saved.length} transaksi`,
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
      ["Pilih dompet atau ketik: tanpa dompet", "", ...wallets.map((wallet) => `- ${wallet}`), "/batal"].join("\n"),
      { replyMarkup: mainKeyboard },
    );
    return { ok: false, kind: "wallet_selection_pending" };
  }

  const transactionToSave = {
    ...transaction,
    wallet: walletChoice ?? null,
  };

  const amount = Number(transactionToSave?.amount);
  const note = String(transactionToSave?.note ?? "").trim();

  if (!Number.isSafeInteger(amount) || amount <= 0 || !note || !transactionToSave.type) {
    await sendTelegramMessage(token, chatId, "Klarifikasi dompet belum valid. Kirim ulang transaksinya.", { replyMarkup: mainKeyboard });
    return { ok: false, kind: "wallet_selection_invalid" };
  }

  const saved = await saveTransactions(database, [{ ...transactionToSave, chatId }]);
  const summary = await getSummary(database, { chatId });
  await clearChatSessionPendingAction(database, chatId);
  await sendTelegramMessage(token, chatId, [
    `Pengeluaran tercatat${walletChoice ? ` dari ${walletChoice}` : " tanpa dompet"}.`,
    "Tercatat: 1 transaksi",
    `Saldo: ${formatSimpleRupiah(summary.balance)}`,
  ].join("\n"), { replyMarkup: mainKeyboard });

  return { ok: true, kind: "wallet_selection_saved", saved, summary };
}

async function handlePendingWalletActionClarification(database, token, chatId, text, session) {
  const intent = session?.pendingPayload?.intent;
  const originalText = session?.pendingPayload?.originalText;
  const choice = parseNumericChoice(text, 3);

  if (!intent || !intent.wallet) {
    await clearChatSessionPendingAction(database, chatId);
    await sendTelegramMessage(token, chatId, "Klarifikasi dompet sudah kedaluwarsa. Kirim ulang perintah.", { replyMarkup: mainKeyboard });
    return { ok: false, kind: "wallet_action_missing" };
  }

  if (choice === "cancel") {
    await clearChatSessionPendingAction(database, chatId);
    await sendTelegramMessage(token, chatId, "Dibatalkan.", { replyMarkup: mainKeyboard });
    return { ok: true, kind: "wallet_action_cancelled" };
  }

  if (choice !== 1 && choice !== 2) {
    await sendTelegramMessage(
      token,
      chatId,
      [
        "Balas:",
        "1. Set saldo dompet",
        "2. Catat pemasukan ke dompet",
        "3. Batal",
        "",
        `Pesan: ${originalText}`,
      ].join("\n"),
      { replyMarkup: mainKeyboard },
    );
    return { ok: false, kind: "wallet_action_pending" };
  }

  await clearChatSessionPendingAction(database, chatId);

  const result = choice === 1
    ? await executeWalletBalanceClarification(database, chatId, intent)
    : await executeWalletIncomeClarification(database, chatId, intent);

  await sendTelegramMessage(token, chatId, result.reply, { replyMarkup: mainKeyboard });

  return {
    ok: true,
    kind: "wallet_action_executed",
    choice: choice === 1 ? "set_balance" : "income_transaction",
    result,
  };
}

async function executeWalletBalanceClarification(database, chatId, intent) {
  const amount = Number(intent.amount);
  const wallet = String(intent.wallet ?? "").trim().toLowerCase();
  const action = intent.intent === "wallet_balance_adjust" ? "adjust" : "set";

  if (!wallet || !Number.isSafeInteger(amount) || amount < 0) {
    return { ok: false, kind: "wallet_action_invalid", reply: "Klarifikasi dompet belum valid. Kirim ulang perintah." };
  }

  const entry = await saveWalletBalanceEntry(database, {
    chatId,
    wallet,
    action,
    amount,
    note: intent.note ?? (action === "set" ? "set saldo dompet" : "adjust saldo dompet"),
  });
  const wallets = await getWalletBalances(database, chatId);

  return {
    ok: true,
    kind: "wallet_balance_clarified",
    entry,
    wallets,
    reply: [
      action === "set"
        ? `Saldo ${wallet} diatur ke ${formatSimpleRupiah(amount)}.`
        : `Saldo ${wallet} naik ${formatSimpleRupiah(amount)}.`,
      "",
      ...wallets.map((item) => `${item.name}: ${formatSimpleRupiah(item.balance)}`),
    ].join("\n"),
  };
}

async function executeWalletIncomeClarification(database, chatId, intent) {
  const amount = Number(intent.amount);
  const wallet = String(intent.wallet ?? "").trim().toLowerCase();
  const note = String(intent.note ?? "pemasukan dompet").trim();

  if (!wallet || !Number.isSafeInteger(amount) || amount <= 0 || !note) {
    return { ok: false, kind: "wallet_income_invalid", reply: "Klarifikasi pemasukan belum valid. Kirim ulang perintah." };
  }

  const saved = await saveTransactions(database, [{
    chatId,
    type: "income",
    amount,
    note,
    category: "income",
    wallet,
    rawAmount: String(amount),
    original: intent.original ?? note,
    confidence: 0.9,
  }]);
  const summary = await getSummary(database, { chatId });

  return {
    ok: true,
    kind: "wallet_income_clarified",
    saved,
    summary,
    reply: [
      `Pemasukan tercatat ke ${wallet}.`,
      "Tercatat: 1 transaksi",
      `Saldo: ${formatSimpleRupiah(summary.balance)}`,
    ].join("\n"),
  };
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
  const wallet = candidate?.wallet ?? null;

  if (!Number.isSafeInteger(amount) || amount <= 0 || !note) {
    return null;
  }

  return {
    type,
    amount,
    note,
    category,
    wallet,
    timestamp: new Date().toISOString(),
    original: candidate?.original ?? note,
  };
}

// TODO: Unify pending_payload structure with options/action for generic numeric choice handling
// across transaction_clarify, wallet_select_clarify, wallet_action_clarify.
function parseNumericChoice(text, maxChoice) {
  const normalized = String(text ?? "").trim().toLowerCase();

  if (normalized === "batal" || normalized === "/batal") {
    return "cancel";
  }

  const num = Number(normalized);
  if (Number.isSafeInteger(num) && num >= 1 && num <= maxChoice) {
    return num;
  }

  return null;
}

function parseClarifiedTransactionType(text) {
  const normalized = String(text ?? "").trim().toLowerCase();

  if (normalized === "1" || normalized === "pengeluaran" || normalized === "expense") {
    return "expense";
  }

  if (normalized === "2" || normalized === "pemasukan" || normalized === "income") {
    return "income";
  }

  if (normalized === "3" || normalized === "batal" || normalized === "/batal" || normalized === "bukan transaksi") {
    return "cancel";
  }

  return null;
}

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function isChatAllowed(chatId, allowedChatIds, env) {
  if (allowedChatIds.has(String(chatId))) {
    return true;
  }

  return !isProductionEnv(env) && allowedChatIds.size === 0;
}

function isProductionEnv(env) {
  return [env.NODE_ENV, env.VERCEL_ENV]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .some((value) => value === "production");
}

export function verifyWebhookSignature(body, signature, token) {
  if (!signature) {
    return false;
  }

  const hash = createHash("sha256")
    .update(token)
    .digest("hex");

  const expected = `sha256=${hash}`;
  return signature === expected;
}
