import {
  clearBudgets,
  deleteLastTransaction,
  deleteBudget,
  deleteTransactionById,
  getBudgetProgress,
  getCategorySummary,
  getSummary,
  listBudgets,
  listTransactions,
  saveBudget,
  saveTransactions,
  searchTransactions,
} from "./database.js";
import {
  answerFinanceQuestion,
  generateBudgetSuggestion,
  generateFinanceInsight,
} from "./ai-service.js";
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

export async function handleMessage(database, message, options = {}) {
  const variableCommand = parseVariableCommand(message);
  if (variableCommand) {
    return handleVariableCommand(database, variableCommand, options);
  }

  const parsed = parseInput(message);

  if (!parsed.ok) {
    return {
      ok: false,
      kind: "error",
      parsed,
      reply: [
        parsed.error,
        "",
        "Wajib:",
        "+ di awal untuk pemasukan",
        "- di awal untuk pengeluaran",
        "",
        "Contoh:",
        "-20k bensin",
        "+500k gaji",
        "saldo",
        "hari ini",
      ].join("\n"),
    };
  }

  if (parsed.kind === "command") {
    return handleCommand(database, parsed.command, options);
  }

  const transactions =
    parsed.kind === "batch" ? parsed.transactions : [parsed.transaction];
  const saved = await saveTransactions(database, transactions);
  const summary = await getSummary(database);

  return {
    ok: true,
    kind: parsed.kind,
    saved,
    summary,
    reply: buildSavedReply(saved, summary),
  };
}

export async function handleCommand(database, command, options = {}) {
  switch (command) {
    case "balance":
      return buildBalanceResponse(database);
    case "today_report":
      return buildPeriodResponse(database, "today", options);
    case "week_report":
      return buildPeriodResponse(database, "week", options);
    case "month_report":
      return buildPeriodResponse(database, "month", options);
    case "year_report":
      return buildPeriodResponse(database, "year", options);
    case "history":
      return buildHistoryResponse(database);
    case "category_report":
      return buildCategoryReportResponse(database);
    case "insight":
      return buildInsightResponse(database, options);
    case "delete_last":
      return buildDeleteLastResponse(database);
    case "export":
      return buildExportResponse(database);
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
    return buildDeleteByIdResponse(database, command.id);
  }

  if (command.command === "search") {
    return buildSearchResponse(database, command.query);
  }

  if (command.command === "finance_question") {
    return buildFinanceQuestionResponse(database, command.question, options);
  }

  if (command.command === "budget_list") {
    return buildBudgetListResponse(database, options);
  }

  if (command.command === "budget_set") {
    return buildBudgetSetResponse(database, command, options);
  }

  if (command.command === "budget_delete") {
    return buildBudgetDeleteResponse(database, command.category, options);
  }

  if (command.command === "budget_reset") {
    return buildBudgetResetInstructionResponse(database, options);
  }

  if (command.command === "budget_suggestion") {
    return buildBudgetSuggestionResponse(database, options);
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

function buildSavedReply(saved, summary) {
  const title =
    saved.length === 1
      ? "1 transaksi berhasil dicatat."
      : `${saved.length} transaksi berhasil dicatat.`;
  const lines = [title, ""];

  for (const transaction of saved.slice(0, 5)) {
    lines.push(formatTransaction(transaction, { includeTimestamp: true }));
  }

  if (saved.length > 5) {
    lines.push(`...dan ${saved.length - 5} transaksi lain.`);
  }

  lines.push("");
  lines.push(`Saldo: ${formatRupiah(summary.balance)}`);
  lines.push(`Masuk total: ${formatRupiah(summary.totalIncome)}`);
  lines.push(`Keluar total: ${formatRupiah(summary.totalExpense)}`);

  return lines.join("\n");
}

async function buildBalanceResponse(database) {
  const summary = await getSummary(database);

  return {
    ok: true,
    kind: "command",
    command: "balance",
    summary,
    reply: [
      "Saldo saat ini",
      "",
      `Saldo: ${formatRupiah(summary.balance)}`,
      `Masuk total: ${formatRupiah(summary.totalIncome)}`,
      `Keluar total: ${formatRupiah(summary.totalExpense)}`,
      `Jumlah transaksi: ${summary.transactionCount}`,
    ].join("\n"),
  };
}

async function buildPeriodResponse(database, period, options) {
  const range = getPeriodRange(period, options.now);
  const summary = await getSummary(database, range);
  const categories = await getCategorySummary(database, { ...range, limit: 5 });
  const recent = await listTransactions(database, { ...range, limit: 5 });
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
    lines.push("Kategori terbesar:");
    for (const category of categories) {
      const amount = category.totalExpense || category.totalIncome;
      lines.push(`- ${category.category}: ${formatRupiah(amount)}`);
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

async function buildHistoryResponse(database) {
  const transactions = await listTransactions(database, { limit: 10 });
  const lines = ["Riwayat transaksi terakhir"];

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

async function buildCategoryReportResponse(database) {
  const categories = await getCategorySummary(database, { limit: 10 });
  const lines = ["Laporan kategori"];

  if (categories.length === 0) {
    lines.push("", "Belum ada transaksi.");
  } else {
    lines.push("");
    for (const category of categories) {
      const amount = category.totalExpense || category.totalIncome;
      lines.push(
        `- ${category.category}: ${formatRupiah(amount)} (${category.transactionCount} transaksi)`,
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

async function buildInsightResponse(database, options) {
  const data = await buildInsightData(database);
  const insightGenerator = options.generateFinanceInsight ?? generateFinanceInsight;
  const aiResult = await insightGenerator(data);

  return {
    ok: true,
    kind: "command",
    command: "insight",
    summary: data.summary,
    categories: data.categories,
    recentTransactions: data.recentTransactions,
    ai: aiResult,
    reply: aiResult.ok ? aiResult.content : buildManualInsightReply(data, aiResult.reason),
  };
}

async function buildFinanceQuestionResponse(database, question, options) {
  const data = await buildFinanceQuestionData(database, question, options);
  const answerGenerator = options.answerFinanceQuestion ?? answerFinanceQuestion;
  const aiResult = await answerGenerator(question, data);

  return {
    ok: true,
    kind: "command",
    command: "finance_question",
    question,
    summary: data.summary,
    categories: data.categories,
    matchingSummary: data.matchingSummary,
    ai: aiResult,
    reply: aiResult.ok ? aiResult.content : buildManualQuestionReply(question, data, aiResult.reason),
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

  const budget = await saveBudget(database, {
    chatId: getChatId(options),
    category: command.category,
    monthlyLimit: amount,
  });
  const data = await buildBudgetData(database, options);

  return {
    ok: true,
    kind: "command",
    command: "budget_set",
    budget,
    budgets: data.budgets,
    reply: [
      `Budget ${budget.category} disimpan.`,
      "",
      `${budget.category}: ${formatRupiah(budget.monthlyLimit)} per bulan`,
      "",
      buildBudgetProgressReply(data),
    ].join("\n"),
  };
}

async function buildBudgetDeleteResponse(database, category, options) {
  const deleted = await deleteBudget(database, getChatId(options), category);

  if (!deleted) {
    return {
      ok: false,
      kind: "error",
      command: "budget_delete",
      reply: `Budget ${category} tidak ditemukan.`,
    };
  }

  return {
    ok: true,
    kind: "command",
    command: "budget_delete",
    deleted,
    reply: `Budget ${deleted.category} dihapus.`,
  };
}

async function buildBudgetResetInstructionResponse(database, options) {
  const budgets = await listBudgets(database, getChatId(options));

  return {
    ok: true,
    kind: "command",
    command: "budget_reset",
    budgets,
    reply: [
      "Reset budget butuh konfirmasi.",
      "",
      `Jumlah budget: ${budgets.length}`,
      "Di Telegram, pakai reset budget lalu balas:",
      "YA RESET BUDGET",
      "",
      "Ketik /batal untuk membatalkan.",
    ].join("\n"),
  };
}

async function buildBudgetSuggestionResponse(database, options) {
  const data = await buildBudgetData(database, options);
  const suggestionGenerator = options.generateBudgetSuggestion ?? generateBudgetSuggestion;
  const aiResult = await suggestionGenerator(data);

  return {
    ok: true,
    kind: "command",
    command: "budget_suggestion",
    budgets: data.budgets,
    ai: aiResult,
    reply: aiResult.ok ? aiResult.content : buildManualBudgetSuggestionReply(data, aiResult.reason),
  };
}

async function buildInsightData(database) {
  const periodLabel = "semua waktu";
  const summary = await getSummary(database);
  const categories = await getCategorySummary(database, { limit: 5 });
  const recentTransactions = await listTransactions(database, { limit: 5 });

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
  const summary = await getSummary(database, range);
  const categories = await getCategorySummary(database, { ...range, limit: 8 });
  const recentTransactions = await listTransactions(database, { ...range, limit: 5 });
  const periodTransactions = await listTransactions(database, { ...range, limit: 100 });
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
  const range = getPeriodRange("month", options.now);
  const summary = await getSummary(database, range);
  const budgets = await getBudgetProgress(database, getChatId(options), range);

  return {
    periodLabel: "bulan ini",
    range,
    summary,
    budgets,
  };
}

function buildManualInsightReply(data, reason) {
  const lines = [
    "Insight keuangan",
    "",
    aiFallbackLabel(reason),
    "",
    `Periode: ${data.periodLabel}`,
    `Saldo: ${formatRupiah(data.summary.balance)}`,
    `Masuk: ${formatRupiah(data.summary.totalIncome)}`,
    `Keluar: ${formatRupiah(data.summary.totalExpense)}`,
    `Transaksi: ${data.summary.transactionCount}`,
  ];

  if (data.categories.length > 0) {
    lines.push("");
    lines.push("Kategori terbesar:");
    for (const category of data.categories) {
      const amount = category.totalExpense || category.totalIncome;
      lines.push(`- ${category.category}: ${formatRupiah(amount)} (${category.transactionCount} transaksi)`);
    }
  }

  if (data.recentTransactions.length > 0) {
    lines.push("");
    lines.push("Transaksi terakhir:");
    for (const transaction of data.recentTransactions) {
      lines.push(`- ${formatTransaction(transaction, { includeTimestamp: true })}`);
    }
  }

  if (data.summary.transactionCount === 0) {
    lines.push("");
    lines.push("Belum ada data transaksi untuk dianalisis.");
  }

  return lines.join("\n");
}

function buildManualQuestionReply(question, data, reason) {
  const lines = [
    "Jawaban keuangan",
    "",
    aiFallbackLabel(reason),
    "",
    `Pertanyaan: ${question}`,
    `Periode: ${data.periodLabel}`,
    `Masuk: ${formatRupiah(data.summary.totalIncome)}`,
    `Keluar: ${formatRupiah(data.summary.totalExpense)}`,
    `Saldo: ${formatRupiah(data.summary.balance)}`,
    `Transaksi: ${data.summary.transactionCount}`,
  ];

  if (data.matchingSummary.transactionCount > 0) {
    lines.push("");
    lines.push(`Data cocok (${data.matchedTerms.join(", ")}):`);
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
    lines.push("Kategori terbesar:");
    for (const category of data.categories.slice(0, 3)) {
      const amount = category.totalExpense || category.totalIncome;
      lines.push(`- ${category.category}: ${formatRupiah(amount)}`);
    }
  }

  return lines.join("\n");
}

function buildBudgetProgressReply(data) {
  const lines = ["Progress budget", "", `Periode: ${data.periodLabel}`];

  if (data.budgets.length === 0) {
    lines.push("", "Belum ada budget. Contoh: budget food 700k");
    return lines.join("\n");
  }

  lines.push("");
  for (const budget of data.budgets) {
    lines.push(
      `${budget.category}: ${formatRupiah(budget.spent)} / ${formatRupiah(budget.monthlyLimit)}, ${budget.percent}%`,
    );

    if (budget.status === "over") {
      lines.push(`! ${budget.category} sudah melewati budget.`);
    } else if (budget.status === "warning") {
      lines.push(`! ${budget.category} sudah mencapai 80% budget.`);
    }
  }

  return lines.join("\n");
}

function buildManualBudgetSuggestionReply(data, reason) {
  const lines = ["Saran budget", "", aiFallbackLabel(reason)];

  if (data.budgets.length === 0) {
    lines.push("", "Belum ada budget. Mulai dari kategori terbesar, misalnya: budget food 700k");
    return lines.join("\n");
  }

  const over = data.budgets.filter((budget) => budget.status === "over");
  const warning = data.budgets.filter((budget) => budget.status === "warning");

  if (over.length > 0) {
    lines.push("");
    lines.push(`Prioritas: kurangi ${over.map((budget) => budget.category).join(", ")} karena sudah melewati budget.`);
  } else if (warning.length > 0) {
    lines.push("");
    lines.push(`Perlu dijaga: ${warning.map((budget) => budget.category).join(", ")} sudah mendekati batas.`);
  } else {
    lines.push("");
    lines.push("Budget bulan ini masih aman berdasarkan data yang tercatat.");
  }

  lines.push("");
  lines.push("Ringkasan:");
  for (const budget of data.budgets.slice(0, 5)) {
    lines.push(`${budget.category}: ${budget.percent}%`);
  }

  return lines.join("\n");
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

async function buildDeleteLastResponse(database) {
  const deleted = await deleteLastTransaction(database);

  if (!deleted) {
    return {
      ok: false,
      kind: "error",
      command: "delete_last",
      reply: "Belum ada transaksi yang bisa dihapus.",
    };
  }

  const summary = await getSummary(database);

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
      `Saldo sekarang: ${formatRupiah(summary.balance)}`,
    ].join("\n"),
  };
}

async function buildDeleteByIdResponse(database, id) {
  const deleted = await deleteTransactionById(database, id);

  if (!deleted) {
    return {
      ok: false,
      kind: "error",
      command: "delete_by_id",
      reply: `Transaksi #${id} tidak ditemukan.`,
    };
  }

  const summary = await getSummary(database);

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
      `Saldo sekarang: ${formatRupiah(summary.balance)}`,
    ].join("\n"),
  };
}

async function buildSearchResponse(database, query) {
  const transactions = await searchTransactions(database, query, { limit: 10 });
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

async function buildExportResponse(database) {
  const transactions = await listTransactions(database, { limit: 100 });
  const generatedAt = new Date().toISOString();
  const header = "id,type,amount,note,category,payment_method,created_at_local,created_at";
  const rows = transactions.map((transaction) =>
    [
      transaction.id,
      transaction.type,
      transaction.amount,
      csvCell(transaction.note),
      transaction.category,
      transaction.paymentMethod ?? "",
      csvCell(formatTransactionTimestamp(transaction.createdAt)),
      transaction.createdAt,
    ].join(","),
  );

  return {
    ok: true,
    kind: "command",
    command: "export",
    filename: `telegram-finance-bot-${generatedAt.slice(0, 10)}.csv`,
    csv: [header, ...rows].join("\n"),
    reply: [
      "Export CSV siap.",
      "",
      `Jumlah transaksi: ${transactions.length}`,
      "Di Telegram, file CSV akan dikirim sebagai dokumen.",
    ].join("\n"),
  };
}

function buildResetInstructionResponse() {
  return {
    ok: true,
    kind: "command",
    command: "reset_data",
    reply: [
      "Reset data butuh konfirmasi.",
      "",
      "Di Telegram, pakai /reset lalu balas dengan:",
      "YA RESET",
      "",
      "Ketik /batal untuk membatalkan.",
    ].join("\n"),
  };
}

function buildHelpResponse() {
  return {
    ok: true,
    kind: "command",
    command: "help",
    reply: [
      "Format Keuangan Telegram",
      "",
      "Wajib pakai tanda di awal:",
      "+ untuk pemasukan",
      "- untuk pengeluaran",
      "",
      "Catat pengeluaran:",
      "-20k bensin",
      "-makan ayam 27rb via qris #kantin",
      "",
      "Catat pemasukan:",
      "+500k gaji",
      "+masuk 1,5jt freelance",
      "",
      "Command:",
      "saldo",
      "hari ini",
      "minggu ini",
      "bulan ini",
      "riwayat",
      "kategori",
      "cari bensin",
      "hapus terakhir",
      "hapus 12",
      "export csv",
      "reset",
    ].join("\n"),
  };
}

function parseVariableCommand(message) {
  const text = String(message ?? "").trim();
  const budgetSetMatch = text.match(/^\/?budget\s+([a-zA-Z0-9_-]{2,32})\s+(.{1,40})$/i);
  if (budgetSetMatch) {
    return {
      command: "budget_set",
      category: budgetSetMatch[1].trim(),
      amountText: budgetSetMatch[2].trim(),
    };
  }

  if (/^\/?(?:budget|cek budget)$/i.test(text)) {
    return { command: "budget_list" };
  }

  const budgetDeleteMatch = text.match(/^\/?(?:hapus|delete)\s+budget\s+([a-zA-Z0-9_-]{2,32})$/i);
  if (budgetDeleteMatch) {
    return {
      command: "budget_delete",
      category: budgetDeleteMatch[1].trim(),
    };
  }

  if (/^\/?reset\s+budget$/i.test(text)) {
    return { command: "budget_reset" };
  }

  if (/^\/?saran\s+budget$/i.test(text)) {
    return { command: "budget_suggestion" };
  }

  const questionMatch = text.match(/^\/?(?:tanya|ask)\s+(.{3,240})$/i);
  if (questionMatch) {
    return {
      command: "finance_question",
      question: questionMatch[1].trim(),
    };
  }

  const deleteMatch = text.match(/^\/?(?:hapus|delete|remove)\s+(?:id\s*)?#?(\d+)$/i);
  if (deleteMatch) {
    return {
      command: "delete_by_id",
      id: Number(deleteMatch[1]),
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

function getChatId(options) {
  return String(options.chatId ?? "default");
}

function formatTransaction(transaction, { includeTimestamp = false } = {}) {
  const sign = transaction.type === "income" ? "+" : "-";
  const category = transaction.category ? ` [${transaction.category}]` : "";
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
    month: "bulan ini",
    year: "tahun ini",
  };

  return labels[period] ?? period;
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

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
