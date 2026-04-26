import {
  clearChatSessionPendingAction,
  clearBudgets,
  deleteLastTransaction,
  deleteBillReminder,
  deleteBudget,
  deleteRecurringRule,
  deleteTransactionById,
  getWalletBalances,
  listWalletBalanceEntries,
  getBudgetProgress,
  getChatSession,
  getCategorySummary,
  getSummary,
  listBillReminders,
  listCategoryAliases,
  listBudgets,
  listCustomCategories,
  listRecurringRules,
  listTransfers,
  listDueBillReminders,
  listDueRecurringRules,
  listTransactions,
  listWallets,
  advanceRecurringRule,
  restoreTransactionById,
  saveCategoryAlias,
  saveBudget,
  saveBillReminder,
  saveCustomCategory,
  saveRecurringRule,
  saveTransactions,
  saveTransfer,
  saveWalletBalanceEntry,
  saveWallet,
  setDefaultWallet,
  setChatSessionPendingAction,
  searchTransactions,
  updateTransactionCategory,
  updateTransactionById,
} from "./database.js";
import { exportTransactionsToCsv } from "./csv-backup.js";
import {
  answerFinanceQuestion,
  detectFinanceAnomalies,
  routeFinancialIntent,
  generateBudgetSuggestion,
  generateFinanceInsight,
  generateMonthlyFinanceReview,
  generateWeeklyFinanceReport,
} from "./ai-router.js";
import { parseAmount, parseInput } from "./parser.js";

const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const TRANSACTION_TIME_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  timeZone: JAKARTA_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const KNOWN_CATEGORIES = new Set([
  "food",
  "transport",
  "groceries",
  "bills",
  "health",
  "education",
  "shopping",
  "entertainment",
  "housing",
  "family",
  "donation",
  "debt",
  "income",
  "other",
]);
const CATEGORY_ALIASES = new Map([
  ["makanan", "food"],
  ["minuman", "food"],
  ["jajan", "food"],
  ["kuliner", "food"],
  ["ayam", "food"],
  ["transportasi", "transport"],
  ["kendaraan", "transport"],
  ["motor", "transport"],
  ["vehicle", "transport"],
  ["bensin", "transport"],
  ["oli", "transport"],
  ["praktikum", "education"],
  ["elektronika", "education"],
  ["kampus", "education"],
  ["kuliah", "education"],
  ["sekolah", "education"],
  ["kos", "housing"],
  ["kost", "housing"],
  ["rent", "housing"],
  ["sewa", "housing"],
  ["rumah", "housing"],
]);

export async function handleMessage(database, message, options = {}) {
  const metrics = options.metrics ?? createMetrics();
  const startedAt = nowMs();
  const result = await handleMessageCore(database, message, { ...options, metrics });
  metrics.totalMs = elapsedMs(startedAt);
  const resultWithMetrics = { ...result, metrics: summarizeMetrics(metrics) };
  logSafePerformance(options, resultWithMetrics);
  return resultWithMetrics;
}

async function handleMessageCore(database, message, options = {}) {
  const normalizedMessage = String(message ?? "").trim();

  const variableCommand = parseVariableCommand(normalizedMessage);
  if (variableCommand) {
    return handleVariableCommand(database, variableCommand, options);
  }

  const parsed = parseInput(normalizedMessage, {
    defaultType: options.defaultTransactionType,
    commandsOnly: true,
  });

  if (parsed.ok && parsed.kind === "command") {
    return handleCommand(database, parsed.command, options);
  }

  const aiIntent = await tryHandleAiIntent(database, normalizedMessage, options);
  if (aiIntent) {
    return aiIntent;
  }

  const manual = parseInput(normalizedMessage, {
    defaultType: options.defaultTransactionType,
    requireExplicitType: true,
  });

  if (manual.ok && manual.kind !== "command") {
    return saveValidatedTransactions(database, manual.kind === "batch" ? manual.transactions : [manual.transaction], manual.kind, options);
  }

  return buildAiFirstFallbackResponse(manual, normalizedMessage);
}

export async function handleCommand(database, command, options = {}) {
  switch (command) {
    case "balance":
      return buildBalanceResponse(database, options);
    case "today_report":
      return buildPeriodResponse(database, "today", options);
    case "week_report":
      return buildPeriodResponse(database, "week", options);
    case "month_report":
      return buildPeriodResponse(database, "month", options);
    case "year_report":
      return buildPeriodResponse(database, "year", options);
    case "history":
      return buildHistoryResponse(database, options);
    case "category_report":
      return buildCategoryReportResponse(database, options);
    case "insight":
      return buildInsightResponse(database, options);
    case "delete_last":
      return buildDeleteLastResponse(database, options);
    case "undo_delete":
      return buildUndoDeleteResponse(database, options);
    case "export":
      return buildExportResponse(database, options);
    case "reset_data":
      return buildResetInstructionResponse();
    case "help":
      return buildHelpResponse();
    default:
      return {
        ok: false,
        kind: "error",
        reply: "Command belum dikenali. Ketik help untuk melihat format.",
      };
  }
}

async function handleVariableCommand(database, command, options) {
  if (command.command === "delete_by_id") {
    return buildDeleteByIdResponse(database, command.id, options);
  }

  if (command.command === "delete_by_text") {
    return buildDeleteByTextClarificationResponse(command.query);
  }

  if (command.command === "edit_by_id") {
    return buildEditByIdResponse(database, command, options);
  }

  if (command.command === "undo_delete") {
    return buildUndoDeleteResponse(database, options);
  }

  if (command.command === "search") {
    return buildSearchResponse(database, command.query, options);
  }

  if (command.command === "finance_question") {
    return buildFinanceQuestionResponse(database, command.question, options);
  }

  if (command.command === "weekly_ai_report") {
    return buildWeeklyAiReportResponse(database, options);
  }

  if (command.command === "monthly_ai_review") {
    return buildMonthlyAiReviewResponse(database, options);
  }

  if (command.command === "anomaly_report") {
    return buildAnomalyReportResponse(database, options);
  }

  if (command.command === "budget_list") {
    return buildBudgetListResponse(database, { ...options, budgetPeriod: command.period });
  }

  if (command.command === "budget_set") {
    return buildBudgetSetResponse(database, command, options);
  }

  if (command.command === "budget_delete") {
    return buildBudgetDeleteResponse(database, command.category, { ...options, budgetPeriod: command.period });
  }

  if (command.command === "budget_reset") {
    return buildBudgetResetInstructionResponse(database, { ...options, budgetPeriod: command.period });
  }

  if (command.command === "budget_suggestion") {
    return buildBudgetSuggestionResponse(database, { ...options, budgetPeriod: command.period });
  }

  if (command.command === "custom_category_save") {
    return buildCustomCategorySaveResponse(database, command, options);
  }

  if (command.command === "category_alias_save") {
    return buildCategoryAliasSaveResponse(database, command, options);
  }

  if (command.command === "category_correction") {
    return buildCategoryCorrectionResponse(database, command, options);
  }

  if (command.command === "wallet_save") {
    return buildWalletSaveResponse(database, command, options);
  }

  if (command.command === "wallet_list") {
    return buildWalletListResponse(database, options);
  }

  if (command.command === "wallet_balance_query") {
    return buildWalletBalanceQueryResponse(database, command, options);
  }

  if (command.command === "wallet_default_set") {
    return buildWalletDefaultSetResponse(database, command, options);
  }

  if (command.command === "wallet_balance_set") {
    return buildWalletBalanceSetResponse(database, command, options);
  }

  if (command.command === "wallet_balance_adjust") {
    return buildWalletBalanceAdjustResponse(database, command, options);
  }

  if (command.command === "transfer_save") {
    return buildTransferSaveResponse(database, command, options);
  }

  if (command.command === "transfer_list") {
    return buildTransferListResponse(database, options);
  }

  if (command.command === "recurring_save") {
    return buildRecurringSaveResponse(database, command, options);
  }

  if (command.command === "recurring_list") {
    return buildRecurringListResponse(database, options);
  }

  if (command.command === "recurring_delete") {
    return buildRecurringDeleteResponse(database, command.id, options);
  }

  if (command.command === "bill_save") {
    return buildBillSaveResponse(database, command, options);
  }

  if (command.command === "bill_list") {
    return buildBillListResponse(database, options);
  }

  if (command.command === "bill_delete") {
    return buildBillDeleteResponse(database, command.id, options);
  }

  if (command.command === "bill_due") {
    return buildBillDueResponse(database, options);
  }

  return {
    ok: false,
    kind: "error",
    reply: "Command belum dikenali. Ketik help untuk melihat format.",
  };
}

export function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function getPeriodRange(period, now = new Date()) {
  const parts = getJakartaDateParts(now);
  const localStartUtc = Date.UTC(parts.year, parts.month - 1, parts.day) - 7 * 60 * 60 * 1000;
  let start = new Date(localStartUtc);
  let end;

  if (period === "week") {
    const mondayOffset = (parts.weekday + 6) % 7;
    start = new Date(localStartUtc - mondayOffset * 24 * 60 * 60 * 1000);
    end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    start = new Date(Date.UTC(parts.year, parts.month - 1, 1) - 7 * 60 * 60 * 1000);
    end = new Date(Date.UTC(parts.year, parts.month, 1) - 7 * 60 * 60 * 1000);
  } else if (period === "year") {
    start = new Date(Date.UTC(parts.year, 0, 1) - 7 * 60 * 60 * 1000);
    end = new Date(Date.UTC(parts.year + 1, 0, 1) - 7 * 60 * 60 * 1000);
  } else {
    end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

async function measureDb(options, operation, callback) {
  const startedAt = nowMs();
  try {
    return await callback();
  } finally {
    const metrics = options?.metrics;
    if (metrics) {
      metrics.dbMs += elapsedMs(startedAt);
      metrics.dbQueries += 1;
      metrics.dbOperations.add(operation);
    }
  }
}

async function measureAi(options, callback) {
  const startedAt = nowMs();
  const result = await callback();
  const elapsed = elapsedMs(startedAt);
  const metrics = options?.metrics;

  if (metrics) {
    metrics.aiMs += Number.isFinite(result?.latencyMs) ? result.latencyMs : elapsed;
    metrics.aiCalls += 1;
    if (result?.profile) {
      metrics.aiProfiles.add(result.profile);
    }
  }

  return result;
}

function createMetrics() {
  return {
    totalMs: 0,
    dbMs: 0,
    dbQueries: 0,
    dbOperations: new Set(),
    aiMs: 0,
    aiCalls: 0,
    aiProfiles: new Set(),
  };
}

function summarizeMetrics(metrics) {
  return {
    totalMs: metrics.totalMs,
    dbMs: metrics.dbMs,
    dbQueries: metrics.dbQueries,
    dbOperations: Array.from(metrics.dbOperations).sort(),
    aiMs: metrics.aiMs,
    aiCalls: metrics.aiCalls,
    aiProfiles: Array.from(metrics.aiProfiles).sort(),
  };
}

function logSafePerformance(options, result) {
  const logger = options.logger;
  if (!logger?.info && typeof logger !== "function") {
    return;
  }

  const payload = {
    event: "message_performance",
    kind: result.kind,
    command: result.command ?? null,
    ok: Boolean(result.ok),
    metrics: result.metrics,
  };

  if (typeof logger === "function") {
    logger(payload);
    return;
  }

  logger.info(payload);
}

function nowMs() {
  return performance.now();
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function buildSavedReply(saved, summary) {
  const title =
    saved.length === 1
      ? "Tercatat: 1 transaksi"
      : `Tercatat: ${saved.length} transaksi`;
  const lines = [title, ""];

  for (const transaction of saved.slice(0, 5)) {
    lines.push(formatTransaction(transaction, { includeTimestamp: true }));
  }

  if (saved.length > 5) {
    lines.push(`+${saved.length - 5} transaksi lain.`);
  }

  lines.push("");
  lines.push(`Saldo: ${formatRupiah(summary.balance)}`);
  lines.push(`Masuk: ${formatRupiah(summary.totalIncome)}`);
  lines.push(`Keluar: ${formatRupiah(summary.totalExpense)}`);

  return lines.join("\n");
}

async function buildBalanceResponse(database, options) {
  const summary = await measureDb(options, "getSummary", () => getSummary(database, { chatId: getChatId(options) }));

  return {
    ok: true,
    kind: "command",
    command: "balance",
    summary,
    reply: [
      "Saldo",
      "",
      `Saldo: ${formatRupiah(summary.balance)}`,
      `Masuk: ${formatRupiah(summary.totalIncome)}`,
      `Keluar: ${formatRupiah(summary.totalExpense)}`,
      `Transaksi: ${summary.transactionCount}`,
    ].join("\n"),
  };
}

async function buildPeriodResponse(database, period, options) {
  const range = getPeriodRange(period, options.now);
  const summary = await measureDb(options, "getSummary", () => getSummary(database, { ...range, chatId: getChatId(options) }));
  const categories = await measureDb(options, "getCategorySummary", () =>
    getCategorySummary(database, { ...range, limit: 5, chatId: getChatId(options) }));
  const recent = await measureDb(options, "listTransactions", () =>
    listTransactions(database, { ...range, limit: 5, chatId: getChatId(options) }));
  const label = periodLabel(period);
  const lines = [
    `Ringkasan ${label}`,
    "",
    `Masuk: ${formatRupiah(summary.totalIncome)}`,
    `Keluar: ${formatRupiah(summary.totalExpense)}`,
    `Selisih: ${formatRupiah(summary.balance)}`,
    `Transaksi: ${summary.transactionCount}`,
  ];

  if (categories.length > 0) {
    lines.push("");
    lines.push("Kategori utama:");
    for (const category of categories) {
      const amount = category.totalExpense || category.totalIncome;
      lines.push(`- ${formatCategoryLabel(category.category)}: ${formatRupiah(amount)}`);
    }
  }

  if (recent.length > 0) {
    lines.push("");
    lines.push("Transaksi terakhir:");
    for (const transaction of recent) {
      lines.push(`- ${formatTransaction(transaction, { includeTimestamp: true })}`);
    }
  }

  return {
    ok: true,
    kind: "command",
    command: `${period}_report`,
    range,
    summary,
    categories,
    recent,
    reply: lines.join("\n"),
  };
}

async function buildHistoryResponse(database, options) {
  const transactions = await measureDb(options, "listTransactions", () =>
    listTransactions(database, { limit: 10, chatId: getChatId(options) }));
  const lines = ["Riwayat terakhir"];

  if (transactions.length === 0) {
    lines.push("", "Belum ada transaksi.");
  } else {
    lines.push("");
    transactions.forEach((transaction) => {
      lines.push(`- #${transaction.id} ${formatTransaction(transaction, { includeTimestamp: true })}`);
    });
  }

  return {
    ok: true,
    kind: "command",
    command: "history",
    transactions,
    reply: lines.join("\n"),
  };
}

async function buildCategoryReportResponse(database, options) {
  const categories = await measureDb(options, "getCategorySummary", () =>
    getCategorySummary(database, { limit: 10, chatId: getChatId(options) }));
  const context = await buildCategoryContext(database, options);
  const lines = ["Laporan kategori"];

  if (categories.length === 0) {
    lines.push("", "Belum ada transaksi.");
  } else {
    lines.push("");
    for (const category of categories) {
      const amount = category.totalExpense || category.totalIncome;
      lines.push(
        `- ${formatCategoryLabel(category.category, context)}: ${formatRupiah(amount)} (${category.transactionCount} transaksi)`,
      );
    }
  }

  return {
    ok: true,
    kind: "command",
    command: "category_report",
    categories,
    reply: lines.join("\n"),
  };
}

async function tryHandleAiIntent(database, message, options) {
  if (!shouldRouteWithAi(message, options)) {
    return null;
  }

  const [wallets, session] = await Promise.all([
    measureDb(options, "listWallets", () => listWallets(database, getChatId(options))),
    measureDb(options, "getChatSession", () => getChatSession(database, getChatId(options))),
  ]);
  const router = options.routeFinancialIntent ?? routeFinancialIntent;
  const result = await measureAi(options, async () => {
    if (options.extractTransactionCandidates && !options.routeFinancialIntent) {
      const legacy = await options.extractTransactionCandidates(message, {
        defaultType: options.defaultTransactionType ?? null,
        wallets: wallets.map((wallet) => wallet.name),
        defaultWallet: session?.defaultWallet ?? null,
      });
      return legacy.ok
        ? {
            ...legacy,
            intent: "transaction_create",
            confidence: 0.9,
            transactions: legacy.candidates ?? [],
          }
        : legacy;
    }

    return router(message, {
      defaultType: options.defaultTransactionType ?? null,
      wallets: wallets.map((wallet) => wallet.name),
      defaultWallet: session?.defaultWallet ?? null,
    });
  });

  if (!result.ok || Number(result.confidence ?? 0) < 0.65) {
    return null;
  }

  return executeAiIntent(database, result, message, options);
}

function shouldRouteWithAi(message, options) {
  if (options.disableAiExtraction) {
    return false;
  }

  const text = String(message ?? "").trim();
  return Boolean(text) && !text.startsWith("/") && text.length <= 500;
}

async function executeAiIntent(database, intent, originalMessage, options) {
  switch (intent.intent) {
    case "transaction_create":
    case "transaction_clarify":
      return handleAiTransactions(database, intent, originalMessage, options);
    case "finance_question":
      return buildFinanceQuestionResponse(database, String(intent.question || originalMessage).trim(), options);
    case "report_request":
      return executeAiReportIntent(database, intent, options);
    case "budget_check":
      return buildBudgetListResponse(database, { ...options, budgetPeriod: normalizeAiBudgetPeriod(intent.period) });
    case "budget_set":
      return buildBudgetSetResponse(database, {
        command: "budget_set",
        period: normalizeAiBudgetPeriod(intent.period),
        category: normalizeCategorySlug(intent.category || "global") || "global",
        amountText: String(intent.amount ?? ""),
      }, options);
    case "wallet_create":
      return buildWalletSaveResponse(database, {
        command: "wallet_save",
        wallet: normalizeWalletNameLocal(intent.wallet || intent.note),
      }, options);
    case "wallet_transfer":
      return buildTransferSaveResponse(database, {
        fromWallet: normalizeWalletNameLocal(intent.fromWallet),
        toWallet: normalizeWalletNameLocal(intent.toWallet),
        amountText: String(intent.amount ?? ""),
        note: String(intent.note ?? "").trim(),
      }, options);
    case "wallet_balance_query":
      return buildWalletBalanceQueryResponse(database, {
        wallet: normalizeWalletNameLocal(intent.wallet),
      }, options);
    case "wallet_balance_set":
    case "wallet_balance_adjust":
      return buildWalletActionClarificationResponse(database, originalMessage, {
        intent: intent.intent,
        wallet: normalizeWalletNameLocal(intent.wallet),
        amount: Number(intent.amount),
        note: String(intent.note ?? "").trim() || null,
      }, options);
    case "bill_create":
      return buildBillSaveResponse(database, {
        command: "bill_save",
        title: String(intent.note || intent.category || "tagihan").trim(),
        amountText: String(intent.amount ?? ""),
        dueDay: normalizeAiDayOfMonth(intent.dayOfMonth),
        category: normalizeCategorySlug(intent.category || "bills") || "bills",
      }, options);
    case "recurring_create":
      return buildRecurringSaveResponse(database, {
        command: "recurring_save",
        cadence: normalizeAiFrequency(intent.frequency),
        templateMessage: buildAiRecurringTemplate(intent, originalMessage),
      }, options);
    case "search_transaction":
      return buildSearchResponse(database, String(intent.note || intent.question || originalMessage).trim(), options);
    case "edit_transaction":
      return buildEditByIdResponse(database, {
        command: "edit_by_id",
        id: Number(intent.id),
        amountText: intent.amount == null ? null : String(intent.amount),
        note: String(intent.note ?? "").trim() || null,
      }, options);
    case "export_csv":
      return buildExportResponse(database, options);
    case "help":
      return buildHelpResponse();
    case "delete_request":
      return buildDeleteByTextClarificationResponse(String(intent.note || originalMessage).trim());
    case "clarification_required":
      return buildAiFirstFallbackResponse({ ok: false, error: "Perintah masih perlu diperjelas." }, originalMessage);
    default:
      return null;
  }
}

async function handleAiTransactions(database, result, originalMessage, options) {
  const validation = await validateAiTransactionCandidates(database, result.transactions, originalMessage, options);
  if (!validation.ok) {
    return {
      ok: false,
      kind: "error",
      command: "ai_intent_router",
      ai: result,
      reply: validation.reply,
    };
  }

  if (validation.ambiguous.length > 0) {
    return {
      ok: true,
      kind: "clarification",
      command: "ai_transaction_clarification",
      pendingClarification: validation.ambiguous,
      reply: buildTransactionClarificationReply(validation.ambiguous),
    };
  }

  return saveValidatedTransactions(database, validation.transactions, "ai_transactions", options, {
    command: "ai_intent_router",
    ai: result,
    prefix: "Tercatat dari AI.",
  });
}

async function saveValidatedTransactions(database, transactions, kind, options, extras = {}) {
  const walletResolution = await resolveWalletAwareTransactions(database, transactions, options);
  if (!walletResolution.ok || walletResolution.kind === "clarification") {
    return walletResolution;
  }

  const chatId = getChatId(options);
  const saved = await measureDb(options, "saveTransactions", () =>
    saveTransactions(database, walletResolution.transactions.map((transaction) => ({ ...transaction, chatId }))));
  const summary = await measureDb(options, "getSummary", () => getSummary(database, { chatId: getChatId(options) }));
  const reply = extras.prefix
    ? [extras.prefix, "", buildSavedReply(saved, summary)].join("\n")
    : buildSavedReply(saved, summary);

  return {
    ok: true,
    kind,
    saved,
    summary,
    reply,
    ...extras,
  };
}

function normalizeAiBudgetPeriod(value) {
  const period = String(value ?? "").toLowerCase();
  if (["weekly", "monthly", "yearly"].includes(period)) {
    return period;
  }
  if (["minggu", "week"].includes(period)) {
    return "weekly";
  }
  if (["tahun", "year"].includes(period)) {
    return "yearly";
  }
  return "monthly";
}

async function executeAiReportIntent(database, intent, options) {
  const period = String(intent.period ?? "").toLowerCase();
  if (["week", "weekly", "minggu"].includes(period)) {
    return buildPeriodResponse(database, "week", options);
  }
  if (["month", "monthly", "bulan"].includes(period)) {
    return buildPeriodResponse(database, "month", options);
  }
  if (["year", "yearly", "tahun"].includes(period)) {
    return buildPeriodResponse(database, "year", options);
  }
  return buildPeriodResponse(database, "today", options);
}

function normalizeAiDayOfMonth(value) {
  const day = Number(value);
  return Number.isSafeInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function normalizeAiFrequency(value) {
  const frequency = String(value ?? "").toLowerCase();
  if (["weekly", "mingguan", "week"].includes(frequency)) {
    return "weekly";
  }
  if (["yearly", "tahunan", "year"].includes(frequency)) {
    return "yearly";
  }
  return "monthly";
}

function buildAiRecurringTemplate(intent, originalMessage) {
  const parts = [intent.amount, intent.note, intent.category ? `kategori ${intent.category}` : null]
    .filter((part) => part != null && String(part).trim())
    .map((part) => String(part).trim());
  return parts.length > 0 ? parts.join(" ") : String(originalMessage ?? "").trim();
}

async function resolveWalletAwareTransactions(database, transactions, options) {
  const chatId = getChatId(options);
  const wallets = await measureDb(options, "listWallets", () => listWallets(database, chatId));
  const session = await measureDb(options, "getChatSession", () => getChatSession(database, chatId));
  const namedWallets = wallets.map((wallet) => wallet.name);
  const resolved = [];

  for (const transaction of transactions) {
    const base = { ...transaction, chatId };

    if (transaction.wallet) {
      resolved.push(base);
      continue;
    }

    if (transaction.type !== "expense") {
      resolved.push(base);
      continue;
    }

    const inferredWallet = inferWalletForExpense(transaction.note, namedWallets)
      ?? session?.defaultWallet
      ?? (namedWallets.length === 1 ? namedWallets[0] : null);

    if (!inferredWallet && namedWallets.length > 1) {
      return buildWalletSelectionClarificationResponse(namedWallets, transaction, options);
    }

    resolved.push({ ...base, wallet: inferredWallet ?? null });
  }

  return { ok: true, transactions: resolved };
}

async function buildInsightResponse(database, options) {
  const data = await buildInsightData(database, options);
  const insightGenerator = options.generateFinanceInsight ?? generateFinanceInsight;
  const aiResult = await measureAi(options, () => insightGenerator(data));

  return {
    ok: true,
    kind: "command",
    command: "insight",
    summary: data.summary,
    categories: data.categories,
    recentTransactions: data.recentTransactions,
    ai: aiResult,
    reply: aiResult.ok ? buildAiInsightReply(data, aiResult.content) : buildManualInsightReply(data, aiResult.reason),
  };
}

async function buildFinanceQuestionResponse(database, question, options) {
  const data = await buildFinanceQuestionData(database, question, options);
  const answerGenerator = options.answerFinanceQuestion ?? answerFinanceQuestion;
  const aiResult = await measureAi(options, () => answerGenerator(question, data));

  return {
    ok: true,
    kind: "command",
    command: "finance_question",
    question,
    summary: data.summary,
    categories: data.categories,
    matchingSummary: data.matchingSummary,
    ai: aiResult,
    reply: aiResult.ok
      ? buildAiQuestionReply(question, data, aiResult.content)
      : buildManualQuestionReply(question, data, aiResult.reason),
  };
}

async function buildWeeklyAiReportResponse(database, options) {
  const data = await buildPeriodicAiReportData(database, "week", options);
  const reportGenerator = options.generateWeeklyFinanceReport ?? generateWeeklyFinanceReport;
  const aiResult = await measureAi(options, () => reportGenerator(data));

  return {
    ok: true,
    kind: "command",
    command: "weekly_ai_report",
    summary: data.summary,
    categories: data.categories,
    budgets: data.budgets,
    wallets: data.wallets,
    ai: aiResult,
    reply: aiResult.ok
      ? buildAiPeriodicReportReply("Laporan mingguan AI", data, aiResult.content)
      : buildManualPeriodicReportReply("Laporan mingguan AI", data, aiResult.reason),
  };
}

async function buildMonthlyAiReviewResponse(database, options) {
  const data = await buildPeriodicAiReportData(database, "month", options);
  const reviewGenerator = options.generateMonthlyFinanceReview ?? generateMonthlyFinanceReview;
  const aiResult = await measureAi(options, () => reviewGenerator(data));

  return {
    ok: true,
    kind: "command",
    command: "monthly_ai_review",
    summary: data.summary,
    categories: data.categories,
    budgets: data.budgets,
    wallets: data.wallets,
    ai: aiResult,
    reply: aiResult.ok
      ? buildAiPeriodicReportReply("Review bulanan AI", data, aiResult.content)
      : buildManualPeriodicReportReply("Review bulanan AI", data, aiResult.reason),
  };
}

async function buildAnomalyReportResponse(database, options) {
  const data = await buildAnomalyData(database, options);
  const detector = options.detectFinanceAnomalies ?? detectFinanceAnomalies;
  const aiResult = await measureAi(options, () => detector(data));

  return {
    ok: true,
    kind: "command",
    command: "anomaly_report",
    summary: data.summary,
    anomalies: data.anomalies,
    ai: aiResult,
    reply: aiResult.ok
      ? buildAiAnomalyReply(data, aiResult.content)
      : buildManualAnomalyReply(data, aiResult.reason),
  };
}

async function buildBudgetListResponse(database, options) {
  const data = await buildBudgetData(database, options);

  return {
    ok: true,
    kind: "command",
    command: "budget_list",
    budgets: data.budgets,
    reply: buildBudgetProgressReply(data),
  };
}

async function buildBudgetSetResponse(database, command, options) {
  const amount = parseBudgetAmount(command.amountText);
  if (!amount) {
    return {
      ok: false,
      kind: "error",
      command: "budget_set",
      reply: "Nominal budget belum valid. Contoh: budget food 700k",
    };
  }

  const budget = await measureDb(options, "saveBudget", () => saveBudget(database, {
    chatId: getChatId(options),
    category: command.category,
    monthlyLimit: amount,
    period: command.period,
  }));
  const data = await buildBudgetData(database, { ...options, budgetPeriod: command.period });

  return {
    ok: true,
    kind: "command",
    command: "budget_set",
    budget,
    budgets: data.budgets,
    reply: [
      `Budget ${formatCategoryLabel(budget.category)} disimpan.`,
      `${formatRupiah(budget.monthlyLimit)} per ${budgetPeriodUnitLabel(budget.period)}`,
      "",
      buildBudgetProgressReply(data),
    ].join("\n"),
  };
}

async function buildBudgetDeleteResponse(database, category, options) {
  const period = options.budgetPeriod ?? "monthly";
  const deleted = await measureDb(options, "deleteBudget", () =>
    deleteBudget(database, getChatId(options), category, { period }));

  if (!deleted) {
    return {
      ok: false,
      kind: "error",
      command: "budget_delete",
      reply: `Budget ${category} tidak ditemukan untuk ${periodLabel(period)}.`,
    };
  }

  return {
    ok: true,
    kind: "command",
    command: "budget_delete",
    deleted,
    reply: `Budget ${formatCategoryLabel(deleted.category)} ${periodLabel(deleted.period)} dihapus.`,
  };
}

async function buildBudgetResetInstructionResponse(database, options) {
  const period = options.budgetPeriod ?? "monthly";
  const budgets = await measureDb(options, "listBudgets", () => listBudgets(database, getChatId(options), { period }));

  return {
    ok: true,
    kind: "clarification",
    command: "budget_reset",
    budgets,
    pendingClarification: {
      action: "budget_reset_confirm",
    },
    reply: [
      "Reset budget perlu konfirmasi.",
      `Budget ${periodLabel(period)}: ${budgets.length}`,
      "",
      "Balas persis:",
      "YA RESET BUDGET",
      "",
      "Ketik /batal untuk batal.",
    ].join("\n"),
  };
}

async function buildBudgetSuggestionResponse(database, options) {
  const data = await buildBudgetData(database, options);
  const suggestionGenerator = options.generateBudgetSuggestion ?? generateBudgetSuggestion;
  const aiResult = await measureAi(options, () => suggestionGenerator(data));

  return {
    ok: true,
    kind: "command",
    command: "budget_suggestion",
    budgets: data.budgets,
    ai: aiResult,
    reply: aiResult.ok
      ? buildAiBudgetSuggestionReply(data, aiResult.content)
      : buildManualBudgetSuggestionReply(data, aiResult.reason),
  };
}

async function buildCustomCategorySaveResponse(database, command, options) {
  const category = normalizeCategorySlug(command.category);
  const label = normalizeCategoryLabel(command.label || command.category);

  if (!category || !label) {
    return {
      ok: false,
      kind: "error",
      command: "custom_category_save",
      reply: "Kategori belum valid. Contoh: kategori baru kopi Kopi",
    };
  }

  const saved = await measureDb(options, "saveCustomCategory", () =>
    saveCustomCategory(database, { chatId: getChatId(options), category, label }));

  return {
    ok: true,
    kind: "command",
    command: "custom_category_save",
    category: saved,
    reply: [
      "Kategori disimpan.",
      `${saved.category}: ${saved.label}`,
    ].join("\n"),
  };
}

async function buildCategoryAliasSaveResponse(database, command, options) {
  const context = await buildCategoryContext(database, options);
  const category = resolveCategory(command.category, context, { allowCustomCreate: true });
  const alias = normalizeAliasText(command.alias);

  if (!alias || !category) {
    return {
      ok: false,
      kind: "error",
      command: "category_alias_save",
      reply: "Alias belum valid. Contoh: alias kategori ayam geprek = food",
    };
  }

  await ensureCustomCategory(database, category, command.category, options, context);
  const saved = await measureDb(options, "saveCategoryAlias", () =>
    saveCategoryAlias(database, { chatId: getChatId(options), alias, category }));

  return {
    ok: true,
    kind: "command",
    command: "category_alias_save",
    alias: saved,
    reply: [
      "Alias kategori disimpan.",
      "",
      `${saved.alias} -> ${formatCategoryLabel(saved.category, context)}`,
    ].join("\n"),
  };
}

async function buildCategoryCorrectionResponse(database, command, options) {
  const context = await buildCategoryContext(database, options);
  const category = resolveCategory(command.category, context, { allowCustomCreate: true });

  if (!category) {
    return {
      ok: false,
      kind: "error",
      command: "category_correction",
      reply: "Kategori koreksi belum valid. Contoh: koreksi kategori 12 food",
    };
  }

  await ensureCustomCategory(database, category, command.category, options, context);
  const updated = await measureDb(options, "updateTransactionCategory", () =>
    updateTransactionCategory(database, command.id, category, getChatId(options)));

  if (!updated) {
    return {
      ok: false,
      kind: "error",
      command: "category_correction",
      reply: `Transaksi #${command.id} tidak ditemukan.`,
    };
  }

  const aliasSource = buildAliasFromNote(updated.note);
  if (aliasSource) {
    await measureDb(options, "saveCategoryAlias", () =>
      saveCategoryAlias(database, {
        chatId: getChatId(options),
        alias: aliasSource,
        category,
      }));
  }

  return {
    ok: true,
    kind: "command",
    command: "category_correction",
    transaction: updated,
    reply: [
      `Kategori transaksi #${updated.id} diperbarui.`,
      "",
      formatTransaction(updated, { includeTimestamp: true, categoryContext: context }),
    ].join("\n"),
  };
}

async function buildWalletSaveResponse(database, command, options) {
  const wallet = await measureDb(options, "saveWallet", () =>
    saveWallet(database, { chatId: getChatId(options), name: command.name }));
  const balances = await measureDb(options, "getWalletBalances", () =>
    getWalletBalances(database, getChatId(options)));

  return {
    ok: true,
    kind: "command",
    command: "wallet_save",
    wallet,
    balances,
    reply: [`Dompet ${wallet.name} disimpan.`, "", buildWalletSummaryLines(balances).join("\n")].join("\n"),
  };
}

async function buildWalletListResponse(database, options) {
  const session = await measureDb(options, "getChatSession", () => getChatSession(database, getChatId(options)));
  const balances = await measureDb(options, "getWalletBalances", () =>
    getWalletBalances(database, getChatId(options)));

  const lines = buildWalletSummaryLines(balances);
  if (session?.defaultWallet) {
    lines.push("", `Dompet default: ${capitalizeFirst(session.defaultWallet)}`);
  }

  return {
    ok: true,
    kind: "command",
    command: "wallet_list",
    wallets: balances,
    reply: lines.join("\n"),
  };
}

async function buildWalletDefaultSetResponse(database, command, options) {
  const session = await measureDb(options, "setDefaultWallet", () =>
    setDefaultWallet(database, getChatId(options), command.wallet));
  const balances = await measureDb(options, "getWalletBalances", () =>
    getWalletBalances(database, getChatId(options)));

  return {
    ok: true,
    kind: "command",
    command: "wallet_default_set",
    session,
    wallets: balances,
    reply: [`Dompet default diatur ke ${capitalizeFirst(command.wallet)}.`, "", buildWalletSummaryLines(balances).join("\n")].join("\n"),
  };
}

async function buildWalletBalanceQueryResponse(database, command, options) {
  const balances = await measureDb(options, "getWalletBalances", () =>
    getWalletBalances(database, getChatId(options)));
  const wallet = balances.find((item) => item.name === normalizeWalletNameLocal(command.wallet));

  return {
    ok: true,
    kind: "command",
    command: "wallet_balance_query",
    wallets: balances,
    reply: wallet
      ? `Saldo ${capitalizeFirst(wallet.name)}: ${formatRupiah(wallet.balance)}`
      : `Dompet ${capitalizeFirst(command.wallet)} belum ada.`,
  };
}

async function buildWalletBalanceSetResponse(database, command, options) {
  const amount = parseBudgetAmount(command.amountText);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    return { ok: false, kind: "error", command: "wallet_balance_set", reply: "Saldo dompet belum valid. Contoh: set saldo dompet bank 70k" };
  }

  const entry = await measureDb(options, "saveWalletBalanceEntry", () =>
    saveWalletBalanceEntry(database, {
      chatId: getChatId(options),
      wallet: command.wallet,
      action: "set",
      amount,
      note: command.note ?? "set saldo dompet",
    }));
  const balances = await measureDb(options, "getWalletBalances", () =>
    getWalletBalances(database, getChatId(options)));

  return {
    ok: true,
    kind: "command",
    command: "wallet_balance_set",
    entry,
    wallets: balances,
    reply: [`Saldo ${command.wallet} diatur ke ${formatRupiah(amount)}.`, "", buildWalletSummaryLines(balances).join("\n")].join("\n"),
  };
}

async function buildWalletBalanceAdjustResponse(database, command, options) {
  const amount = parseSignedBudgetAmount(command.amountText);
  if (!Number.isSafeInteger(amount) || amount === 0) {
    return { ok: false, kind: "error", command: "wallet_balance_adjust", reply: "Perubahan saldo belum valid. Contoh: tambah saldo dompet bank 20k" };
  }

  const entry = await measureDb(options, "saveWalletBalanceEntry", () =>
    saveWalletBalanceEntry(database, {
      chatId: getChatId(options),
      wallet: command.wallet,
      action: "adjust",
      amount,
      note: command.note ?? "adjust saldo dompet",
    }));
  const balances = await measureDb(options, "getWalletBalances", () =>
    getWalletBalances(database, getChatId(options)));

  return {
    ok: true,
    kind: "command",
    command: "wallet_balance_adjust",
    entry,
    wallets: balances,
    reply: [`Saldo ${command.wallet} ${amount > 0 ? "naik" : "turun"} ${formatRupiah(Math.abs(amount))}.`, "", buildWalletSummaryLines(balances).join("\n")].join("\n"),
  };
}

async function buildTransferSaveResponse(database, command, options) {
  const amount = parseBudgetAmount(command.amountText);
  if (!amount) {
    return { ok: false, kind: "error", command: "transfer_save", reply: "Nominal transfer belum valid. Contoh: transfer cash bca 50k" };
  }

  const transfer = await measureDb(options, "saveTransfer", () =>
    saveTransfer(database, {
      chatId: getChatId(options),
      fromWallet: command.fromWallet,
      toWallet: command.toWallet,
      amount,
      note: command.note,
    }));
  const balances = await measureDb(options, "getWalletBalances", () =>
    getWalletBalances(database, getChatId(options)));

  return {
    ok: true,
    kind: "command",
    command: "transfer_save",
    transfer,
    wallets: balances,
    reply: [
      `Transfer tercatat: ${formatRupiah(transfer.amount)}`,
      `${transfer.fromWallet} -> ${transfer.toWallet}`,
      "",
      buildWalletSummaryLines(balances).join("\n"),
    ].join("\n"),
  };
}

async function buildTransferListResponse(database, options) {
  const transfers = await measureDb(options, "listTransfers", () => listTransfers(database, getChatId(options), { limit: 10 }));
  const lines = ["Riwayat transfer"];

  if (transfers.length === 0) {
    lines.push("", "Belum ada transfer.");
  } else {
    lines.push("");
    for (const transfer of transfers) {
      lines.push(`- #${transfer.id} ${transfer.fromWallet} -> ${transfer.toWallet}: ${formatRupiah(transfer.amount)}`);
    }
  }

  return { ok: true, kind: "command", command: "transfer_list", transfers, reply: lines.join("\n") };
}

async function buildRecurringSaveResponse(database, command, options) {
  const rule = await measureDb(options, "saveRecurringRule", () =>
    saveRecurringRule(database, {
      chatId: getChatId(options),
      cadence: command.cadence,
      templateMessage: command.templateMessage,
      nextRunAt: nextRecurringRunAt(command.cadence, options.now).toISOString(),
    }));

  return {
    ok: true,
    kind: "command",
    command: "recurring_save",
    rule,
    reply: `Transaksi rutin disimpan: #${rule.id} (${cadenceLabel(rule.cadence)})`,
  };
}

async function buildRecurringListResponse(database, options) {
  const rules = await measureDb(options, "listRecurringRules", () => listRecurringRules(database, getChatId(options)));
  const lines = ["Transaksi rutin"];
  if (rules.length === 0) {
    lines.push("", "Belum ada transaksi rutin.");
  } else {
    lines.push("");
    for (const rule of rules) {
      lines.push(`- #${rule.id} ${cadenceLabel(rule.cadence)} | ${rule.templateMessage}`);
    }
  }
  return { ok: true, kind: "command", command: "recurring_list", rules, reply: lines.join("\n") };
}

async function buildRecurringDeleteResponse(database, id, options) {
  const deleted = await measureDb(options, "deleteRecurringRule", () => deleteRecurringRule(database, id));
  if (!deleted) {
    return { ok: false, kind: "error", command: "recurring_delete", reply: `Transaksi rutin #${id} tidak ditemukan.` };
  }
  return { ok: true, kind: "command", command: "recurring_delete", deleted, reply: `Transaksi rutin #${deleted.id} dimatikan.` };
}

async function buildBillSaveResponse(database, command, options) {
  const amount = command.amountText ? parseBudgetAmount(command.amountText) : null;
  const reminder = await measureDb(options, "saveBillReminder", () =>
    saveBillReminder(database, {
      chatId: getChatId(options),
      title: command.title,
      amount,
      category: command.category,
      dueDay: command.dueDay,
    }));
  return { ok: true, kind: "command", command: "bill_save", reminder, reply: `Tagihan disimpan: ${reminder.title}\nJatuh tempo: tanggal ${reminder.dueDay}` };
}

async function buildBillListResponse(database, options) {
  const reminders = await measureDb(options, "listBillReminders", () => listBillReminders(database, getChatId(options)));
  const lines = ["Tagihan"];
  if (reminders.length === 0) {
    lines.push("", "Belum ada tagihan.");
  } else {
    lines.push("");
    for (const reminder of reminders) {
      const amount = reminder.amount ? ` - ${formatRupiah(reminder.amount)}` : "";
      lines.push(`- #${reminder.id} ${reminder.title}${amount} | tanggal ${reminder.dueDay}`);
    }
  }
  return { ok: true, kind: "command", command: "bill_list", reminders, reply: lines.join("\n") };
}

async function buildBillDeleteResponse(database, id, options) {
  const deleted = await measureDb(options, "deleteBillReminder", () => deleteBillReminder(database, id));
  if (!deleted) {
    return { ok: false, kind: "error", command: "bill_delete", reply: `Tagihan #${id} tidak ditemukan.` };
  }
  return { ok: true, kind: "command", command: "bill_delete", deleted, reply: `Tagihan #${deleted.id} dihapus.` };
}

async function buildBillDueResponse(database, options) {
  const reminders = await measureDb(options, "listDueBillReminders", () =>
    listDueBillReminders(database, options.now ?? new Date(), getChatId(options)));
  const lines = ["Tagihan jatuh tempo hari ini"];
  if (reminders.length === 0) {
    lines.push("", "Tidak ada tagihan jatuh tempo hari ini.");
  } else {
    lines.push("");
    for (const reminder of reminders) {
      const amount = reminder.amount ? ` - ${formatRupiah(reminder.amount)}` : "";
      lines.push(`- ${reminder.title}${amount}`);
    }
  }
  return { ok: true, kind: "command", command: "bill_due", reminders, reply: lines.join("\n") };
}

async function buildInsightData(database, options = {}) {
  const periodLabel = "semua waktu";
  const summary = await measureDb(options, "getSummary", () => getSummary(database, { chatId: getChatId(options) }));
  const categories = await measureDb(options, "getCategorySummary", () =>
    getCategorySummary(database, { limit: 5, chatId: getChatId(options) }));
  const recentTransactions = await measureDb(options, "listTransactions", () =>
    listTransactions(database, { limit: 5, chatId: getChatId(options) }));

  return {
    periodLabel,
    summary,
    categories,
    recentTransactions: recentTransactions.map((transaction) => ({
      type: transaction.type,
      amount: transaction.amount,
      note: transaction.note,
      category: transaction.category,
      createdAt: transaction.createdAt,
    })),
  };
}

async function buildFinanceQuestionData(database, question, options) {
  const period = periodFromQuestion(question);
  const range = period ? getPeriodRange(period, options.now) : {};
  const periodLabel = period ? periodLabelForQuestion(period) : "semua waktu";
  const chatId = getChatId(options);
  const summary = await measureDb(options, "getSummary", () => getSummary(database, { ...range, chatId }));
  const categories = await measureDb(options, "getCategorySummary", () =>
    getCategorySummary(database, { ...range, limit: 8, chatId }));
  const recentTransactions = await measureDb(options, "listTransactions", () =>
    listTransactions(database, { ...range, limit: 5, chatId }));
  const periodTransactions = await measureDb(options, "listTransactions", () =>
    listTransactions(database, { ...range, limit: 100, chatId }));
  const matchedTerms = getFinanceQuestionTerms(question, categories);
  const matchingTransactions = filterTransactionsByTerms(periodTransactions, matchedTerms).slice(0, 10);
  const matchingSummary = summarizeTransactions(matchingTransactions);

  return {
    periodLabel,
    range,
    summary,
    categories,
    recentTransactions: recentTransactions.map(toAiTransaction),
    matchingTransactions: matchingTransactions.map(toAiTransaction),
    matchingSummary,
    matchedTerms,
  };
}

async function buildBudgetData(database, options) {
  const budgetPeriod = options.budgetPeriod ?? "monthly";
  const range = getBudgetRange(budgetPeriod, options.now);
  const chatId = getChatId(options);
  const summary = await measureDb(options, "getSummary", () => getSummary(database, { ...range, chatId }));
  const budgets = await measureDb(options, "getBudgetProgress", () =>
    getBudgetProgress(database, chatId, { ...range, period: budgetPeriod }));

  return {
    periodLabel: periodLabel(budgetPeriod),
    budgetPeriod,
    range,
    summary,
    budgets,
  };
}

async function buildPeriodicAiReportData(database, period, options) {
  const range = getPeriodRange(period, options.now);
  const chatId = getChatId(options);
  const summary = await measureDb(options, "getSummary", () => getSummary(database, { ...range, chatId }));
  const categories = await measureDb(options, "getCategorySummary", () =>
    getCategorySummary(database, { ...range, limit: 6, chatId }));
  const recentTransactions = await measureDb(options, "listTransactions", () =>
    listTransactions(database, { ...range, limit: 6, chatId }));
  const wallets = await measureDb(options, "getWalletBalances", () =>
    getWalletBalances(database, chatId));
  const budgets = await measureDb(options, "getBudgetProgress", () =>
    getBudgetProgress(database, chatId, {
      ...range,
      period: period === "week" ? "weekly" : "monthly",
    }));

  return {
    periodLabel: periodLabel(period),
    summary,
    categories,
    recentTransactions,
    wallets: wallets.slice(0, 6),
    budgets: budgets.slice(0, 6),
  };
}

async function buildAnomalyData(database, options) {
  const range = getPeriodRange("month", options.now);
  const chatId = getChatId(options);
  const summary = await measureDb(options, "getSummary", () => getSummary(database, { ...range, chatId }));
  const recentTransactions = await measureDb(options, "listTransactions", () =>
    listTransactions(database, { ...range, limit: 40, chatId }));

  return {
    periodLabel: "30 hari terakhir",
    summary,
    recentTransactions: recentTransactions.slice(0, 8),
    anomalies: detectAnomalyCandidates(recentTransactions),
  };
}

function buildManualInsightReply(data, reason) {
  const lines = [
    ...buildInsightSummaryLines(data),
    "",
    aiFallbackLabel(reason),
  ];

  if (data.summary.transactionCount === 0) {
    lines.push("");
    lines.push("Belum ada data transaksi untuk dianalisis.");
  }

  return lines.join("\n");
}

function buildAiInsightReply(data, content) {
  const insight = cleanAiText(content);
  const lines = buildInsightSummaryLines(data);

  if (insight) {
    lines.push("");
    lines.push("Insight:");
    lines.push(insight);
  }

  return lines.join("\n");
}

function buildInsightSummaryLines(data) {
  const lines = [
    "Ringkasan keuangan",
    `Periode: ${capitalizeFirst(data.periodLabel)}`,
    `Transaksi: ${data.summary.transactionCount}`,
    "",
    `Saldo: ${formatRupiah(data.summary.balance)}`,
    `Masuk: ${formatRupiah(data.summary.totalIncome)}`,
    `Keluar: ${formatRupiah(data.summary.totalExpense)}`,
  ];

  const expenseCategories = data.categories
    .filter((category) => category.totalExpense > 0)
    .map((category) => ({
      ...category,
      percent: data.summary.totalExpense > 0
        ? Math.round((category.totalExpense / data.summary.totalExpense) * 100)
        : 0,
    }));

  if (expenseCategories.length > 0) {
    lines.push("");
    lines.push("Kategori pengeluaran:");
    expenseCategories.slice(0, 5).forEach((category, index) => {
      lines.push(`${index + 1}. ${formatCategoryLabel(category.category)}: ${formatRupiah(category.totalExpense)} (${category.percent}%)`);
    });
  }

  const largestExpenses = data.recentTransactions
    .filter((transaction) => transaction.type === "expense")
    .slice()
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 3);

  if (largestExpenses.length > 0) {
    lines.push("");
    lines.push("Pengeluaran terbesar:");
    largestExpenses.forEach((transaction, index) => {
      lines.push(`${index + 1}. ${transaction.note}: ${formatRupiah(transaction.amount)}`);
    });
  }

  return lines;
}

function buildManualQuestionReply(question, data, reason) {
  const lines = [
    ...buildQuestionSummaryLines(question, data),
    "",
    aiFallbackLabel(reason),
  ];

  return lines.join("\n");
}

function buildAiQuestionReply(question, data, content) {
  const answer = cleanAiText(content);
  const lines = buildQuestionSummaryLines(question, data);

  if (answer) {
    lines.push("");
    lines.push("Jawaban:");
    lines.push(answer);
  }

  return lines.join("\n");
}

function buildQuestionSummaryLines(question, data) {
  const lines = [
    "Jawaban keuangan",
    `Tanya: ${question}`,
    `Periode: ${data.periodLabel}`,
    `Keluar: ${formatRupiah(data.summary.totalExpense)}`,
    `Masuk: ${formatRupiah(data.summary.totalIncome)}`,
    `Saldo: ${formatRupiah(data.summary.balance)}`,
    `Transaksi: ${data.summary.transactionCount}`,
  ];

  if (data.matchingSummary.transactionCount > 0) {
    lines.push("");
    lines.push(`Data cocok: ${data.matchedTerms.join(", ")}`);
    lines.push(`Keluar: ${formatRupiah(data.matchingSummary.totalExpense)}`);
    lines.push(`Masuk: ${formatRupiah(data.matchingSummary.totalIncome)}`);
    lines.push(`Transaksi: ${data.matchingSummary.transactionCount}`);
  } else if (data.summary.transactionCount === 0) {
    lines.push("");
    lines.push("Data belum cukup untuk menjawab pertanyaan ini.");
  } else {
    lines.push("");
    lines.push("Tidak ada transaksi yang cocok langsung dengan pertanyaan.");
  }

  if (data.categories.length > 0) {
    lines.push("");
    lines.push("Kategori utama:");
    for (const category of data.categories.slice(0, 3)) {
      const amount = category.totalExpense || category.totalIncome;
      lines.push(`- ${formatCategoryLabel(category.category)}: ${formatRupiah(amount)}`);
    }
  }

  return lines;
}

function buildAiPeriodicReportReply(title, data, content) {
  const report = cleanAiText(content);
  const lines = buildPeriodicReportSummaryLines(title, data);

  if (report) {
    lines.push("");
    lines.push("Catatan:");
    lines.push(report);
  }

  return lines.join("\n");
}

function buildManualPeriodicReportReply(title, data, reason) {
  return [
    ...buildPeriodicReportSummaryLines(title, data),
    "",
    aiFallbackLabel(reason),
  ].join("\n");
}

function buildPeriodicReportSummaryLines(title, data) {
  const lines = [
    title,
    `Periode: ${capitalizeFirst(data.periodLabel)}`,
    `Masuk: ${formatRupiah(data.summary.totalIncome)}`,
    `Keluar: ${formatRupiah(data.summary.totalExpense)}`,
    `Saldo: ${formatRupiah(data.summary.balance)}`,
    `Transaksi: ${data.summary.transactionCount}`,
  ];

  if (data.categories.length > 0) {
    lines.push("", "Kategori utama:");
    for (const category of data.categories.slice(0, 3)) {
      const amount = category.totalExpense || category.totalIncome;
      lines.push(`- ${formatCategoryLabel(category.category)}: ${formatRupiah(amount)}`);
    }
  }

  const attentionBudgets = data.budgets.filter((budget) => budget.percent >= 80);
  if (attentionBudgets.length > 0) {
    lines.push("", "Budget yang perlu dijaga:");
    for (const budget of attentionBudgets.slice(0, 3)) {
      lines.push(`- ${formatCategoryLabel(budget.category)}: ${budget.percent}%`);
    }
  }

  if (data.wallets.length > 0) {
    lines.push("", "Dompet:");
    for (const wallet of data.wallets.slice(0, 3)) {
      lines.push(`- ${capitalizeFirst(wallet.name)}: ${formatRupiah(wallet.balance)}`);
    }
  }

  return lines;
}

function buildAiAnomalyReply(data, content) {
  const text = cleanAiText(content);
  const lines = buildAnomalySummaryLines(data);

  if (text) {
    lines.push("", "Analisis:", text);
  }

  return lines.join("\n");
}

function buildManualAnomalyReply(data, reason) {
  return [
    ...buildAnomalySummaryLines(data),
    "",
    aiFallbackLabel(reason),
  ].join("\n");
}

function buildAnomalySummaryLines(data) {
  const lines = [
    "Cek anomali",
    `Periode: ${data.periodLabel}`,
    `Keluar: ${formatRupiah(data.summary.totalExpense)}`,
    `Transaksi: ${data.summary.transactionCount}`,
  ];

  if (data.anomalies.length === 0) {
    lines.push("", "Belum ada anomali pengeluaran yang menonjol.");
    return lines;
  }

  lines.push("", "Kandidat anomali:");
  for (const item of data.anomalies.slice(0, 3)) {
    lines.push(
      `- #${item.id} ${item.note}: ${formatRupiah(item.amount)} (${formatCategoryLabel(item.category)})`,
    );
  }
  return lines;
}

function buildBudgetProgressReply(data) {
  const lines = [`Budget ${data.periodLabel}`];

  if (data.budgets.length === 0) {
    lines.push("", `Belum ada budget. Mulai: ${budgetExampleForPeriod(data.budgetPeriod)}`);
    return lines.join("\n");
  }

  lines.push("");
  for (const budget of data.budgets) {
    const label = formatCategoryLabel(budget.category);
    lines.push(
      `${label}: ${formatRupiah(budget.spent)} / ${formatRupiah(budget.monthlyLimit)} (${budget.percent}%)`,
    );

    if (budget.status === "over") {
      lines.push(`Batas terlewati: ${label}.`);
    } else if (budget.status === "warning") {
      lines.push(`Mendekati batas: ${label} sudah 80% atau lebih.`);
    }
  }

  return lines.join("\n");
}

function buildManualBudgetSuggestionReply(data, reason) {
  const lines = [buildBudgetHeadline(data), "", aiFallbackLabel(reason)];

  if (data.budgets.length === 0) {
    lines.push("", `Belum ada budget. Mulai dari: ${budgetExampleForPeriod(data.budgetPeriod)}`);
    return lines.join("\n");
  }

  const over = data.budgets.filter((budget) => budget.status === "over");
  const warning = data.budgets.filter((budget) => budget.status === "warning");

  if (over.length > 0) {
    lines.push("");
    lines.push(`Prioritas: kurangi ${formatBudgetCategoryList(over)} karena sudah melewati budget.`);
  } else if (warning.length > 0) {
    lines.push("");
    lines.push(`Perlu dijaga: ${formatBudgetCategoryList(warning)} sudah mendekati batas.`);
  } else {
    lines.push("");
    lines.push(`Budget ${data.periodLabel} masih aman berdasarkan data yang tercatat.`);
  }

  lines.push("");
  lines.push("Ringkasan:");
  for (const budget of data.budgets.slice(0, 5)) {
    lines.push(`${formatCategoryLabel(budget.category)}: ${budget.percent}%`);
  }

  return lines.join("\n");
}

function buildAiBudgetSuggestionReply(data, content) {
  const suggestion = cleanAiText(content);
  const lines = [buildBudgetHeadline(data)];

  if (data.budgets.length > 0) {
    lines.push("");
    for (const budget of data.budgets.slice(0, 5)) {
      lines.push(`${formatCategoryLabel(budget.category)}: ${budget.percent}%`);
    }
  }

  if (suggestion) {
    lines.push("");
    lines.push("Saran:");
    lines.push(suggestion);
  }

  return lines.join("\n");
}

function buildBudgetHeadline(data) {
  return `Saran budget ${data.periodLabel}`;
}

function budgetExampleForPeriod(period) {
  if (period === "weekly") {
    return "budget minggu food 200k";
  }

  if (period === "yearly") {
    return "budget tahun global 12jt";
  }

  return "budget food 700k";
}

function budgetPeriodUnitLabel(period) {
  if (period === "weekly") {
    return "minggu";
  }

  if (period === "yearly") {
    return "tahun";
  }

  return "bulan";
}

function formatBudgetCategoryList(budgets) {
  return budgets.map((budget) => formatCategoryLabel(budget.category)).join(", ");
}

function buildWalletSummaryLines(wallets) {
  const lines = ["Dompet"];

  if (!wallets.length) {
    lines.push("", "Belum ada dompet.");
    return lines;
  }

  lines.push("");
  for (const wallet of wallets) {
    lines.push(`- ${capitalizeFirst(wallet.name)}: ${formatRupiah(wallet.balance)}`);
  }

  return lines;
}

function recurringCommandCadence(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "harian") {
    return "daily";
  }
  if (normalized === "mingguan") {
    return "weekly";
  }
  return "monthly";
}

function cadenceLabel(value) {
  if (value === "daily") {
    return "harian";
  }
  if (value === "weekly") {
    return "mingguan";
  }
  return "bulanan";
}

function nextRecurringRunAt(cadence, now = new Date()) {
  const date = new Date(now);
  if (cadence === "daily") {
    date.setUTCDate(date.getUTCDate() + 1);
  } else if (cadence === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7);
  } else {
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return date;
}

function buildAiFirstFallbackResponse(parsed, message) {
  const detail = parsed?.error ? ["", parsed.error] : [];
  return {
    ok: false,
    kind: "clarification",
    parsed,
    reply: [
      "Aku belum yakin maksudnya.",
      ...detail,
      "",
      "Balas:",
      "1. Catat pengeluaran",
      "2. Catat pemasukan",
      "3. Bukan transaksi",
      "",
      `Pesan: ${String(message ?? "").trim()}`,
    ].join("\n"),
  };
}

async function validateAiTransactionCandidates(database, candidates, original, options) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      ok: false,
      reply: [
        "Pesan belum bisa dibaca sebagai transaksi.",
        "",
        "Coba tulis nominal dan catatan, misalnya: beli bensin 20k",
      ].join("\n"),
    };
  }

  if (candidates.length > 10) {
    return {
      ok: false,
      reply: "Terlalu banyak transaksi dalam satu pesan. Maksimal 10 transaksi.",
    };
  }

  const transactions = [];
  const ambiguous = [];
  const context = await buildCategoryContext(database, options);

  for (const candidate of candidates) {
    const type = candidate?.type;
    const confidence = Number(candidate?.confidence ?? 0);
    const amount = Number(candidate?.amount);
    const note = String(candidate?.note ?? "").trim();
    const category = normalizeAiCategory(candidate?.category, type, context);

    if (!Number.isSafeInteger(amount) || amount <= 0 || !note || confidence < 0.75) {
      return {
        ok: false,
        reply: [
          "Transaksi belum cukup jelas.",
          "",
          "Balas:",
          "1. Catat pengeluaran",
          "2. Catat pemasukan",
          "3. Bukan transaksi",
        ].join("\n"),
      };
    }

    if (type !== "income" && type !== "expense") {
      ambiguous.push({ amount, note, category, confidence, original });
      continue;
    }

    transactions.push({
      type,
      amount,
      note,
      category,
      wallet: normalizeWalletNameLocal(candidate?.wallet) || null,
      paymentMethod: null,
      date: null,
      tags: [],
      rawAmount: String(amount),
      original,
      confidence,
    });
  }

  return {
    ok: true,
    transactions,
    ambiguous,
  };
}

function buildTransactionClarificationReply(candidates) {
  const lines = [
    "Transaksi masih ambigu.",
    "",
    "Balas:",
    "1. Pengeluaran",
    "2. Pemasukan",
    "3. Bukan transaksi",
    "",
    "Menunggu:",
  ];

  candidates.slice(0, 3).forEach((candidate, index) => {
    lines.push(`${index + 1}. ${formatRupiah(candidate.amount)} ${candidate.note} [${formatCategoryLabel(candidate.category)}]`);
  });

  lines.push("");
  lines.push("Belum ada transaksi yang disimpan.");

  return lines.join("\n");
}

function buildWalletActionClarificationResponse(database, originalText, intent, options) {
  void database;
  void options;
  return {
    ok: true,
    kind: "clarification",
    command: "wallet_action_clarify",
    pendingClarification: {
      action: "wallet_action_clarify",
      originalText,
      intent,
    },
    reply: [
      "Input dompet masih ambigu.",
      "",
      `Pesan: ${originalText}`,
      "",
      "Balas:",
      "1. Set saldo dompet",
      "2. Catat pemasukan ke dompet",
      "3. Batal",
    ].join("\n"),
  };
}

function buildWalletSelectionClarificationResponse(wallets, transaction, options) {
  void options;
  return {
    ok: true,
    kind: "clarification",
    command: "wallet_select_clarify",
    pendingClarification: {
      action: "wallet_select_clarify",
      transaction,
      wallets,
    },
    reply: [
      "Pengeluaran ini dari dompet mana?",
      "",
      `${formatRupiah(transaction.amount)} ${transaction.note}`,
      "",
      ...wallets.map((wallet) => `- ${wallet}`),
      "- tanpa dompet",
      "/batal",
    ].join("\n"),
  };
}

function inferWalletForExpense(note, wallets) {
  const text = String(note ?? "").toLowerCase();
  for (const wallet of wallets) {
    const escaped = wallet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b(?:dompet|pakai|dari)\\s+${escaped}\\b`, "i").test(text) || new RegExp(`\\b${escaped}\\b`, "i").test(text)) {
      return wallet;
    }
  }

  if (/\bpakai\s+gopay\b/i.test(text) && wallets.includes("gopay")) {
    return "gopay";
  }
  if (/\bpakai\s+dana\b/i.test(text) && wallets.includes("dana")) {
    return "dana";
  }
  if (/\bpakai\s+cash\b/i.test(text) && wallets.includes("cash")) {
    return "cash";
  }

  return null;
}

function normalizeWalletNameLocal(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}

function normalizeAiCategory(value, type, context = null) {
  const resolved = resolveCategory(value, context);
  if (resolved) {
    return resolved;
  }
  return type === "income" ? "income" : "other";
}

async function buildCategoryContext(database, options) {
  const chatId = getChatId(options);
  const [customCategories, categoryAliases] = await Promise.all([
    measureDb(options, "listCustomCategories", () => listCustomCategories(database, chatId)),
    measureDb(options, "listCategoryAliases", () => listCategoryAliases(database, chatId)),
  ]);
  const customLabels = new Map(customCategories.map((item) => [item.category, item.label]));
  const aliasMap = new Map(categoryAliases.map((item) => [item.alias, item.category]));

  return {
    customCategories,
    categoryAliases,
    customLabels,
    aliasMap,
  };
}

function resolveCategory(value, context = null, { allowCustomCreate = false } = {}) {
  const slug = normalizeCategorySlug(value);
  const alias = normalizeAliasText(value);

  if (KNOWN_CATEGORIES.has(slug)) {
    return slug;
  }

  if (context?.customLabels?.has(slug)) {
    return slug;
  }

  if (context?.aliasMap?.has(alias)) {
    return context.aliasMap.get(alias);
  }

  const builtInAlias = CATEGORY_ALIASES.get(slug) ?? CATEGORY_ALIASES.get(alias);
  if (builtInAlias) {
    return builtInAlias;
  }

  return allowCustomCreate && slug ? slug : null;
}

async function ensureCustomCategory(database, category, labelSource, options, context = null) {
  if (KNOWN_CATEGORIES.has(category) || context?.customLabels?.has(category)) {
    return null;
  }

  const label = normalizeCategoryLabel(labelSource || category);
  if (!label) {
    return null;
  }

  return measureDb(options, "saveCustomCategory", () =>
    saveCustomCategory(database, {
      chatId: getChatId(options),
      category,
      label,
    }));
}

function normalizeCategorySlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

function normalizeCategoryLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

function normalizeAliasText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function buildAliasFromNote(note) {
  const alias = normalizeAliasText(note);
  return alias.length >= 2 ? alias : "";
}

function cleanAiText(value) {
  return String(value ?? "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function detectAnomalyCandidates(transactions) {
  const expenses = Array.isArray(transactions)
    ? transactions.filter((transaction) => transaction.type === "expense" && transaction.amount > 0)
    : [];

  if (expenses.length === 0) {
    return [];
  }

  const totalExpense = expenses.reduce((total, transaction) => total + transaction.amount, 0);
  const candidates = [];

  for (const transaction of expenses) {
    const sameCategory = expenses.filter((item) => item.category === transaction.category);
    const categoryAverage = sameCategory.length > 0
      ? Math.round(sameCategory.reduce((total, item) => total + item.amount, 0) / sameCategory.length)
      : transaction.amount;
    const ratio = categoryAverage > 0 ? transaction.amount / categoryAverage : 0;
    const share = totalExpense > 0 ? transaction.amount / totalExpense : 0;

    if (transaction.amount >= 100000 && ratio >= 2) {
      candidates.push({
        id: transaction.id,
        note: transaction.note,
        category: transaction.category,
        amount: transaction.amount,
        baseline: categoryAverage,
        ratio: roundRatio(ratio),
        reason: "category_spike",
        createdAt: transaction.createdAt,
      });
      continue;
    }

    if (transaction.amount >= 150000 && share >= 0.4) {
      candidates.push({
        id: transaction.id,
        note: transaction.note,
        category: transaction.category,
        amount: transaction.amount,
        baseline: categoryAverage,
        ratio: roundRatio(ratio),
        reason: "expense_share_spike",
        createdAt: transaction.createdAt,
      });
    }
  }

  return candidates
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5);
}

function roundRatio(value) {
  return Math.round(Number(value) * 10) / 10;
}

function formatCategoryLabel(value, context = null) {
  const labels = {
    food: "Makanan",
    transport: "Transport",
    groceries: "Belanja",
    bills: "Tagihan",
    health: "Kesehatan",
    education: "Pendidikan",
    shopping: "Shopping",
    entertainment: "Hiburan",
    housing: "Rumah",
    family: "Keluarga",
    donation: "Donasi",
    debt: "Utang",
    income: "Pemasukan",
    global: "Global",
    other: "Lainnya",
  };

  if (context?.customLabels?.has(value)) {
    return context.customLabels.get(value);
  }

  return labels[value] ?? capitalizeFirst(value);
}

function capitalizeFirst(value) {
  const text = String(value ?? "").trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}

function aiFallbackLabel(reason) {
  if (reason === "ai_disabled") {
    return "AI belum aktif, jadi ini ringkasan manual.";
  }

  if (reason === "missing_api_key") {
    return "AI belum punya API key, jadi ini ringkasan manual.";
  }

  return "AI sedang tidak bisa dipakai, jadi ini ringkasan manual.";
}

async function buildDeleteLastResponse(database, options) {
  const chatId = getChatId(options);
  const deleted = await measureDb(options, "deleteLastTransaction", () => deleteLastTransaction(database, chatId));

  if (!deleted) {
    return {
      ok: false,
      kind: "error",
      command: "delete_last",
      reply: "Belum ada transaksi yang bisa dihapus.",
    };
  }

  const summary = await measureDb(options, "getSummary", () => getSummary(database, { chatId: getChatId(options) }));
  await rememberUndoDelete(database, deleted, options);

  return {
    ok: true,
    kind: "command",
    command: "delete_last",
    deleted,
    summary,
    reply: [
      "Transaksi terakhir dihapus.",
      "",
      formatTransaction(deleted, { includeTimestamp: true }),
      "",
      `Saldo: ${formatRupiah(summary.balance)}`,
      "Ketik undo untuk membatalkan.",
    ].join("\n"),
  };
}

async function buildDeleteByIdResponse(database, id, options) {
  const deleted = await measureDb(options, "deleteTransactionById", () =>
    deleteTransactionById(database, id, getChatId(options)));

  if (!deleted) {
    return {
      ok: false,
      kind: "error",
      command: "delete_by_id",
      reply: `Transaksi #${id} tidak ditemukan.`,
    };
  }

  const summary = await measureDb(options, "getSummary", () => getSummary(database, { chatId: getChatId(options) }));
  await rememberUndoDelete(database, deleted, options);

  return {
    ok: true,
    kind: "command",
    command: "delete_by_id",
    deleted,
    summary,
    reply: [
      `Transaksi #${deleted.id} dihapus.`,
      "",
      formatTransaction(deleted, { includeTimestamp: true }),
      "",
      `Saldo: ${formatRupiah(summary.balance)}`,
      "Ketik undo untuk membatalkan.",
    ].join("\n"),
  };
}

function buildDeleteByTextClarificationResponse(query) {
  return {
    ok: false,
    kind: "error",
    command: "delete_by_text",
    reply: [
      "Hapus transaksi perlu ID.",
      "",
      `Cari dulu: ${query}`,
      "Lalu kirim: hapus 123",
    ].join("\n"),
  };
}

async function buildUndoDeleteResponse(database, options) {
  const chatId = getChatId(options);
  const session = await measureDb(options, "getChatSession", () => getChatSession(database, chatId));
  const transactionId = Number(session?.pendingPayload?.transactionId ?? 0);

  if (session?.pendingAction !== "undo_delete" || !Number.isSafeInteger(transactionId) || transactionId <= 0) {
    return {
      ok: false,
      kind: "error",
      command: "undo_delete",
      reply: "Tidak ada hapus terakhir yang bisa dibatalkan.",
    };
  }

  const restored = await measureDb(options, "restoreTransactionById", () =>
    restoreTransactionById(database, transactionId, chatId));

  if (!restored) {
    await measureDb(options, "clearChatSessionPendingAction", () =>
      clearChatSessionPendingAction(database, chatId));
    return {
      ok: false,
      kind: "error",
      command: "undo_delete",
      reply: "Transaksi yang ingin dikembalikan sudah tidak tersedia.",
    };
  }

  await measureDb(options, "clearChatSessionPendingAction", () =>
    clearChatSessionPendingAction(database, chatId));
  const summary = await measureDb(options, "getSummary", () => getSummary(database, { chatId: getChatId(options) }));

  return {
    ok: true,
    kind: "command",
    command: "undo_delete",
    restored,
    summary,
    reply: [
      `Transaksi #${restored.id} dikembalikan.`,
      "",
      formatTransaction(restored, { includeTimestamp: true }),
      "",
      `Saldo: ${formatRupiah(summary.balance)}`,
    ].join("\n"),
  };
}

async function buildEditByIdResponse(database, command, options) {
  const parsed = parseInput(command.replacement, {
    defaultType: options.defaultTransactionType,
  });

  if (!parsed.ok || parsed.kind === "command" || parsed.kind === "batch") {
    return {
      ok: false,
      kind: "error",
      command: "edit_by_id",
      reply: "Edit belum valid. Contoh: edit 12 beli bensin 20 ribu kategori transport",
    };
  }

  const updated = await measureDb(options, "updateTransactionById", () =>
    updateTransactionById(database, command.id, parsed.transaction, getChatId(options)));

  if (!updated) {
    return {
      ok: false,
      kind: "error",
      command: "edit_by_id",
      reply: `Transaksi #${command.id} tidak ditemukan.`,
    };
  }

  const summary = await measureDb(options, "getSummary", () => getSummary(database, { chatId: getChatId(options) }));

  return {
    ok: true,
    kind: "command",
    command: "edit_by_id",
    transaction: updated,
    summary,
    reply: [
      `Transaksi #${updated.id} diperbarui.`,
      "",
      formatTransaction(updated, { includeTimestamp: true }),
      "",
      `Saldo: ${formatRupiah(summary.balance)}`,
    ].join("\n"),
  };
}

async function buildSearchResponse(database, query, options) {
  const transactions = await measureDb(options, "searchTransactions", () =>
    searchTransactions(database, query, { limit: 10, chatId: getChatId(options) }));
  const lines = [`Hasil pencarian: ${query}`];

  if (transactions.length === 0) {
    lines.push("", "Tidak ada transaksi yang cocok.");
  } else {
    lines.push("");
    for (const transaction of transactions) {
      lines.push(`- #${transaction.id} ${formatTransaction(transaction, { includeTimestamp: true })}`);
    }
  }

  return {
    ok: true,
    kind: "command",
    command: "search",
    query,
    transactions,
    reply: lines.join("\n"),
  };
}

async function buildExportResponse(database, options) {
  const generatedAt = new Date().toISOString();
  const exported = await measureDb(options, "exportTransactionsToCsv", () =>
    exportTransactionsToCsv(database, { limit: 1000, chatId: getChatId(options) }));

  return {
    ok: true,
    kind: "command",
    command: "export",
    filename: `telegram-finance-bot-${generatedAt.slice(0, 10)}.csv`,
    csv: exported.csv,
    reply: [
      "Export CSV siap.",
      `Transaksi: ${exported.count}`,
      "File akan dikirim sebagai dokumen.",
    ].join("\n"),
  };
}

function buildResetInstructionResponse() {
  return {
    ok: true,
    kind: "clarification",
    command: "reset_data",
    pendingClarification: {
      action: "reset_confirm",
    },
    reply: [
      "Reset data perlu konfirmasi.",
      "",
      "Balas persis:",
      "YA RESET",
      "",
      "Ketik /batal untuk batal.",
    ].join("\n"),
  };
}

function buildHelpResponse() {
  return {
    ok: true,
    kind: "command",
    command: "help",
    reply: [
      "Bantuan Keuangan",
      "",
      "Catat natural:",
      "beli bensin 20 ribu",
      "gaji freelance masuk 1,5 juta",
      "",
      "Ringkasan:",
      "saldo",
      "hari ini / minggu ini / bulan ini",
      "riwayat / kategori / insight",
      "tanya bulan ini boros di mana?",
      "",
      "Budget:",
      "budget food 700k",
      "cek budget minggu",
      "saran budget",
      "",
      "Dompet:",
      "dompet tambah cash",
      "set saldo dompet bank 70k",
      "transfer bca cash 50k",
      "",
      "Lainnya:",
      "tagihan tambah wifi 250k tiap 15 kategori bills",
      "transaksi rutin tambah bulanan 500k kos kategori housing",
      "edit 12 30k bensin",
      "cari bensin / hapus 12 / undo",
      "export csv / reset",
    ].join("\n"),
  };
}

function parseVariableCommand(message) {
  const text = String(message ?? "").trim();

  const walletDefaultMatch = text.match(/^\/?(?:default dompet|dompet default)\s+([a-zA-Z0-9_-]{2,32})$/i);
  if (walletDefaultMatch) {
    return { command: "wallet_default_set", wallet: walletDefaultMatch[1].trim() };
  }

  const walletBalanceSetMatch = text.match(/^\/?(?:set saldo dompet|saldo dompet set)\s+([a-zA-Z0-9_-]{2,32})\s+(.{1,40})$/i);
  if (walletBalanceSetMatch) {
    return {
      command: "wallet_balance_set",
      wallet: walletBalanceSetMatch[1].trim(),
      amountText: walletBalanceSetMatch[2].trim(),
    };
  }

  const walletBalanceQueryMatch = text.match(/^\/?(?:saldo dompet|cek saldo dompet|saldo wallet)\s+([a-zA-Z0-9_-]{2,32})$/i);
  if (walletBalanceQueryMatch) {
    return { command: "wallet_balance_query", wallet: walletBalanceQueryMatch[1].trim() };
  }

  const walletBalanceAdjustMatch = text.match(/^\/?(?:tambah saldo dompet|kurangi saldo dompet|adjust saldo dompet)\s+([a-zA-Z0-9_-]{2,32})\s+(.{1,40})$/i);
  if (walletBalanceAdjustMatch) {
    const prefix = /^\/?kurangi/i.test(text) ? "-" : "";
    return {
      command: "wallet_balance_adjust",
      wallet: walletBalanceAdjustMatch[1].trim(),
      amountText: `${prefix}${walletBalanceAdjustMatch[2].trim()}`,
    };
  }

  const walletSaveMatch = text.match(
    /^\/?(?:(?:dompet|wallet|akun)\s+(?:tambah|buat|bikin|baru)|(?:tambah|buat|bikin)\s+(?:dompet|wallet|akun)|wallet add)\s+([a-zA-Z0-9_-]{2,32})$/i,
  );
  if (walletSaveMatch) {
    return { command: "wallet_save", name: walletSaveMatch[1].trim() };
  }

  if (/^\/?(?:dompet|cek dompet|lihat dompet|list dompet|daftar dompet|saldo dompet|wallet|wallet saya|akun|daftar akun)$/i.test(text)) {
    return { command: "wallet_list" };
  }

  const explicitTransferMatch =
    text.match(/^\/?transfer\s+(?:dari\s+)?([a-zA-Z0-9_-]{2,32})\s+ke\s+([a-zA-Z0-9_-]{2,32})\s+([^\s]+)(?:\s+(.{2,80}))?$/i)
    ?? text.match(/^\/?(?:pindah(?:kan)?|kirim(?:kan)?)\s+([^\s]+)\s+dari\s+([a-zA-Z0-9_-]{2,32})\s+ke\s+([a-zA-Z0-9_-]{2,32})(?:\s+(.{2,80}))?$/i);
  const shorthandTransferMatch = text.startsWith("/")
    ? text.match(/^\/?([a-zA-Z0-9_-]{2,32})\s+ke\s+([a-zA-Z0-9_-]{2,32})\s+([^\s]+(?:\s+(?:ribu|rebu|rb|r|k|juta|jt|mio|m))?)(?:\s+(.{2,80}))?$/i)
    : null;
  const transferMatch = explicitTransferMatch ?? shorthandTransferMatch;

  const compactTransferMatch = /\bke\b/i.test(text)
    ? null
    : text.match(/^\/?transfer\s+([a-zA-Z0-9_-]{2,32})\s+([a-zA-Z0-9_-]{2,32})\s+([^\s]+)(?:\s+(.{2,80}))?$/i);
  if (!transferMatch && compactTransferMatch) {
    return {
      command: "transfer_save",
      fromWallet: compactTransferMatch[1].trim(),
      toWallet: compactTransferMatch[2].trim(),
      amountText: compactTransferMatch[3].trim(),
      note: compactTransferMatch[4]?.trim() ?? "",
    };
  }

  if (transferMatch) {
    if (/^(?:pindah(?:kan)?|kirim(?:kan)?)\b/i.test(text)) {
      return {
        command: "transfer_save",
        fromWallet: transferMatch[2].trim(),
        toWallet: transferMatch[3].trim(),
        amountText: transferMatch[1].trim(),
        note: transferMatch[4]?.trim() ?? "",
      };
    }

    if (/^\/?transfer\b/i.test(text)) {
      return {
        command: "transfer_save",
        fromWallet: transferMatch[1].trim(),
        toWallet: transferMatch[2].trim(),
        amountText: transferMatch[3].trim(),
        note: transferMatch[4]?.trim() ?? "",
      };
    }

    return {
      command: "transfer_save",
      fromWallet: transferMatch[1].trim(),
      toWallet: transferMatch[2].trim(),
      amountText: transferMatch[3].trim(),
      note: transferMatch[4]?.trim() ?? "",
    };
  }

  if (/^\/?(?:transfer|riwayat transfer)$/i.test(text)) {
    return { command: "transfer_list" };
  }

  const recurringSaveMatch = text.match(/^\/?(?:transaksi rutin tambah|rutin tambah)\s+(harian|mingguan|bulanan)\s+(.{3,200})$/i);
  if (recurringSaveMatch) {
    return {
      command: "recurring_save",
      cadence: recurringCommandCadence(recurringSaveMatch[1]),
      templateMessage: recurringSaveMatch[2].trim(),
    };
  }

  if (/^\/?(?:transaksi rutin|rutin)$/i.test(text)) {
    return { command: "recurring_list" };
  }

  const recurringDeleteMatch = text.match(/^\/?(?:hapus|delete)\s+rutin\s+#?(\d+)$/i);
  if (recurringDeleteMatch) {
    return { command: "recurring_delete", id: Number(recurringDeleteMatch[1]) };
  }

  const billSaveMatch = text.match(/^\/?(?:tagihan tambah|reminder tambah)\s+(.{2,60})\s+(\d+[\w.,]*)\s+tiap\s+(\d{1,2})(?:\s+kategori\s+([a-zA-Z0-9_-]{2,32}))?$/i);
  if (billSaveMatch) {
    return {
      command: "bill_save",
      title: billSaveMatch[1].trim(),
      amountText: billSaveMatch[2].trim(),
      dueDay: Number(billSaveMatch[3]),
      category: billSaveMatch[4]?.trim() ?? null,
    };
  }

  if (/^\/?(?:tagihan|reminder tagihan)$/i.test(text)) {
    return { command: "bill_list" };
  }

  if (/^\/?(?:tagihan hari ini|cek tagihan)$/i.test(text)) {
    return { command: "bill_due" };
  }

  const billDeleteMatch = text.match(/^\/?(?:hapus|delete)\s+tagihan\s+#?(\d+)$/i);
  if (billDeleteMatch) {
    return { command: "bill_delete", id: Number(billDeleteMatch[1]) };
  }

  const budgetPeriodAlias = String(text ?? "")
    .replace(/^\/?budget\s+minggu\s+/i, "/budget weekly ")
    .replace(/^\/?budget\s+bulan\s+/i, "/budget monthly ")
    .replace(/^\/?budget\s+tahun\s+/i, "/budget yearly ")
    .replace(/^\/?cek budget\s+minggu$/i, "/budget-list weekly")
    .replace(/^\/?cek budget\s+bulan$/i, "/budget-list monthly")
    .replace(/^\/?cek budget\s+tahun$/i, "/budget-list yearly")
    .replace(/^\/?saran budget\s+minggu$/i, "/budget-suggestion weekly")
    .replace(/^\/?saran budget\s+bulan$/i, "/budget-suggestion monthly")
    .replace(/^\/?saran budget\s+tahun$/i, "/budget-suggestion yearly")
    .replace(/^\/?reset budget\s+minggu$/i, "/budget-reset weekly")
    .replace(/^\/?reset budget\s+bulan$/i, "/budget-reset monthly")
    .replace(/^\/?reset budget\s+tahun$/i, "/budget-reset yearly")
    .replace(/^\/?(?:hapus|delete)\s+budget\s+minggu\s+/i, "/budget-delete weekly ")
    .replace(/^\/?(?:hapus|delete)\s+budget\s+bulan\s+/i, "/budget-delete monthly ")
    .replace(/^\/?(?:hapus|delete)\s+budget\s+tahun\s+/i, "/budget-delete yearly ");

  const periodBudgetSetMatch = budgetPeriodAlias.match(/^\/?budget\s+(weekly|monthly|yearly)\s+([a-zA-Z0-9_-]{2,32})\s+(.{1,40})$/i);
  if (periodBudgetSetMatch) {
    return {
      command: "budget_set",
      period: periodBudgetSetMatch[1].toLowerCase(),
      category: periodBudgetSetMatch[2].trim(),
      amountText: periodBudgetSetMatch[3].trim(),
    };
  }

  const periodBudgetListMatch = budgetPeriodAlias.match(/^\/?budget-list\s+(weekly|monthly|yearly)$/i);
  if (periodBudgetListMatch) {
    return { command: "budget_list", period: periodBudgetListMatch[1].toLowerCase() };
  }

  const periodBudgetDeleteMatch = budgetPeriodAlias.match(/^\/?budget-delete\s+(weekly|monthly|yearly)\s+([a-zA-Z0-9_-]{2,32})$/i);
  if (periodBudgetDeleteMatch) {
    return {
      command: "budget_delete",
      period: periodBudgetDeleteMatch[1].toLowerCase(),
      category: periodBudgetDeleteMatch[2].trim(),
    };
  }

  const periodBudgetResetMatch = budgetPeriodAlias.match(/^\/?budget-reset\s+(weekly|monthly|yearly)$/i);
  if (periodBudgetResetMatch) {
    return { command: "budget_reset", period: periodBudgetResetMatch[1].toLowerCase() };
  }

  const periodBudgetSuggestionMatch = budgetPeriodAlias.match(/^\/?budget-suggestion\s+(weekly|monthly|yearly)$/i);
  if (periodBudgetSuggestionMatch) {
    return { command: "budget_suggestion", period: periodBudgetSuggestionMatch[1].toLowerCase() };
  }

  if (/^\/?(?:undo|batalkan hapus|kembalikan terakhir)$/i.test(text)) {
    return { command: "undo_delete" };
  }

  const editMatch = text.match(/^\/?(?:edit|ubah transaksi|ganti transaksi)\s+#?(\d+)\s+(.{3,240})$/i);
  if (editMatch) {
    return {
      command: "edit_by_id",
      id: Number(editMatch[1]),
      replacement: editMatch[2].trim(),
    };
  }

  const categoryMatch = text.match(/^\/?(?:kategori baru|tambah kategori)\s+([a-zA-Z0-9_-]{2,32})(?:\s+(.{1,40}))?$/i);
  if (categoryMatch) {
    return {
      command: "custom_category_save",
      category: categoryMatch[1].trim(),
      label: categoryMatch[2]?.trim() ?? categoryMatch[1].trim(),
    };
  }

  const aliasMatch = text.match(/^\/?alias kategori\s+(.{2,80}?)\s*(?:=|ke|jadi)\s*([a-zA-Z0-9_-]{2,32})$/i);
  if (aliasMatch) {
    return {
      command: "category_alias_save",
      alias: aliasMatch[1].trim(),
      category: aliasMatch[2].trim(),
    };
  }

  const correctionMatch = text.match(/^\/?(?:koreksi|ubah|ganti)\s+kategori\s+#?(\d+)\s+([a-zA-Z0-9_-]{2,32})$/i);
  if (correctionMatch) {
    return {
      command: "category_correction",
      id: Number(correctionMatch[1]),
      category: correctionMatch[2].trim(),
    };
  }

  const budgetSetMatch = text.match(/^\/?budget\s+([a-zA-Z0-9_-]{2,32})\s+(.{1,40}?)(?:\s+bulan\s+ini)?$/i);
  if (budgetSetMatch) {
    return {
      command: "budget_set",
      period: "monthly",
      category: budgetSetMatch[1].trim(),
      amountText: budgetSetMatch[2].trim(),
    };
  }

  if (/^\/?(?:budget|cek budget)$/i.test(text)) {
    return { command: "budget_list", period: "monthly" };
  }

  const budgetDeleteMatch = text.match(/^\/?(?:hapus|delete)\s+budget\s+([a-zA-Z0-9_-]{2,32})$/i);
  if (budgetDeleteMatch) {
    return {
      command: "budget_delete",
      period: "monthly",
      category: budgetDeleteMatch[1].trim(),
    };
  }

  if (/^\/?reset\s+budget$/i.test(text)) {
    return { command: "budget_reset", period: "monthly" };
  }

  if (/^\/?saran\s+budget$/i.test(text)) {
    return { command: "budget_suggestion", period: "monthly" };
  }

  if (/^\/?(?:laporan ai minggu ini|laporan mingguan ai|weekly ai report|laporanai)$/i.test(text)) {
    return { command: "weekly_ai_report" };
  }

  if (/^\/?(?:review ai bulan ini|review bulanan ai|monthly ai review|reviewai)$/i.test(text)) {
    return { command: "monthly_ai_review" };
  }

  if (/^\/?(?:cek anomali|anomali|anomaly check)$/i.test(text)) {
    return { command: "anomaly_report" };
  }

  const questionMatch = text.match(/^\/?(?:tanya|ask)\s+(.{3,240})$/i);
  if (questionMatch) {
    return {
      command: "finance_question",
      question: questionMatch[1].trim(),
    };
  }

  const naturalQuestionMatch = text.match(/^(.{8,240})\s+(?:di mana|dimana|apa|berapa|kapan|kenapa|mengapa)\??$/i);
  if (naturalQuestionMatch && /\b(?:bulan ini|minggu ini|hari ini|tahun ini|boros|paling banyak|terbanyak|budget)\b/i.test(text)) {
    return {
      command: "finance_question",
      question: text.trim(),
    };
  }

  const deleteMatch = text.match(/^\/?(?:hapus|delete|remove)\s+(?:id\s*)?#?(\d+)$/i);
  if (deleteMatch) {
    return {
      command: "delete_by_id",
      id: Number(deleteMatch[1]),
    };
  }

  const deleteTextMatch = text.match(/^\/?(?:hapus|delete|remove)\s+transaksi\s+(.{3,120})$/i);
  if (deleteTextMatch) {
    return {
      command: "delete_by_text",
      query: deleteTextMatch[1].trim(),
    };
  }

  const searchMatch = text.match(/^\/?(?:cari|search|find)\s+(.{2,80})$/i);
  if (searchMatch) {
    return {
      command: "search",
      query: searchMatch[1].trim(),
    };
  }

  return null;
}

function periodFromQuestion(question) {
  const text = String(question ?? "").toLowerCase();

  if (/\b(hari ini|today)\b/.test(text)) {
    return "today";
  }

  if (/\b(minggu ini|pekan ini|week)\b/.test(text)) {
    return "week";
  }

  if (/\b(bulan ini|month)\b/.test(text)) {
    return "month";
  }

  if (/\b(tahun ini|year)\b/.test(text)) {
    return "year";
  }

  return "month";
}

function periodLabelForQuestion(period) {
  return periodLabel(period);
}

function getFinanceQuestionTerms(question, categories) {
  const stopWords = new Set([
    "tanya",
    "berapa",
    "total",
    "bulan",
    "minggu",
    "tahun",
    "hari",
    "ini",
    "kenapa",
    "pengeluaran",
    "pemasukan",
    "boros",
    "aman",
    "dimana",
    "mana",
    "yang",
    "apa",
    "ga",
    "nggak",
  ]);
  const tokens = String(question ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));
  const categoryTerms = categories
    .map((category) => category.category)
    .filter((category) => String(question).toLowerCase().includes(String(category).toLowerCase()));

  return Array.from(new Set([...categoryTerms, ...tokens])).slice(0, 5);
}

function filterTransactionsByTerms(transactions, terms) {
  if (!Array.isArray(terms) || terms.length === 0) {
    return [];
  }

  return transactions.filter((transaction) => {
    const haystack = [
      transaction.note,
      transaction.category,
      transaction.paymentMethod,
      transaction.original,
      ...(transaction.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();

    return terms.some((term) => haystack.includes(String(term).toLowerCase()));
  });
}

function summarizeTransactions(transactions) {
  const totalIncome = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const totalExpense = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((total, transaction) => total + transaction.amount, 0);

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    transactionCount: transactions.length,
  };
}

function toAiTransaction(transaction) {
  return {
    type: transaction.type,
    amount: transaction.amount,
    note: transaction.note,
    category: transaction.category,
    createdAt: transaction.createdAt,
  };
}

function parseBudgetAmount(value) {
  const match = String(value ?? "").match(/(?:rp\.?\s*)?(\d+(?:[.,]\d{3})*(?:[.,]\d+)?|\d+)\s*(ribu|rebu|rb|r|k|juta|jt|mio|m)?/i);
  if (!match) {
    return 0;
  }

  const amount = parseAmount(match[1], match[2]);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

function parseSignedBudgetAmount(value) {
  const text = String(value ?? "").trim();
  const sign = text.startsWith("-") ? -1 : 1;
  const amount = parseBudgetAmount(text.replace(/^[+-]\s*/, ""));
  return amount > 0 ? amount * sign : 0;
}

function getChatId(options) {
  return String(options.chatId ?? "default");
}

async function rememberUndoDelete(database, transaction, options) {
  return measureDb(options, "setChatSessionPendingAction", () =>
    setChatSessionPendingAction(database, getChatId(options), "undo_delete", {
      transactionId: transaction.id,
    }));
}

function formatTransaction(transaction, { includeTimestamp = false, categoryContext = null } = {}) {
  const sign = transaction.type === "income" ? "+" : "-";
  const category = transaction.category ? ` [${formatCategoryLabel(transaction.category, categoryContext)}]` : "";
  const timestamp = includeTimestamp ? ` - ${formatTransactionTimestamp(transaction.createdAt)}` : "";
  return `${sign}${formatRupiah(transaction.amount)} ${transaction.note}${category}${timestamp}`;
}

function formatTransactionTimestamp(value) {
  if (!value) {
    return "tanggal tidak tersedia";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return `${TRANSACTION_TIME_FORMATTER.format(date)} WIB`;
}

function periodLabel(period) {
  const labels = {
    today: "hari ini",
    week: "minggu ini",
    weekly: "minggu ini",
    month: "bulan ini",
    monthly: "bulan ini",
    year: "tahun ini",
    yearly: "tahun ini",
  };

  return labels[period] ?? period;
}

function getBudgetRange(period, now = new Date()) {
  if (period === "weekly") {
    return getPeriodRange("week", now);
  }

  if (period === "yearly") {
    return getPeriodRange("year", now);
  }

  return getPeriodRange("month", now);
}

function getJakartaDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const values = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: weekdayNumber(values.weekday),
  };
}

function weekdayNumber(value) {
  const weekdays = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return weekdays[value] ?? 0;
}

