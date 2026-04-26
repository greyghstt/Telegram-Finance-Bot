import { createChatCompletion } from "./ai-service.js";

const PROFILE_QUICK = "quick";
const PROFILE_DEEP = "deep";

export async function routeFinancialIntent(text, context = {}, options = {}) {
  const result = await createChatCompletion({
    data: { text, context },
    options,
    profile: PROFILE_QUICK,
    messageBuilder: buildFinancialIntentRouterMessages,
  });

  if (!result.ok) {
    return result;
  }

  try {
    const parsed = JSON.parse(stripJsonFence(result.content));
    return {
      ok: true,
      enabled: true,
      provider: result.provider,
      model: result.model,
      profile: result.profile,
      latencyMs: result.latencyMs,
      intent: parsed?.intent ?? "unknown_or_ambiguous",
      confidence: parsed?.confidence ?? 0,
      transactions: Array.isArray(parsed?.transactions) ? parsed.transactions : [],
      question: parsed?.question ?? null,
      category: parsed?.category ?? null,
      period: parsed?.period ?? null,
      amount: parsed?.amount ?? null,
      wallet: parsed?.wallet ?? null,
      fromWallet: parsed?.fromWallet ?? null,
      toWallet: parsed?.toWallet ?? null,
      note: parsed?.note ?? null,
      id: parsed?.id ?? null,
      dayOfMonth: parsed?.dayOfMonth ?? null,
      frequency: parsed?.frequency ?? null,
      raw: result.content,
    };
  } catch {
    return fallbackResult("invalid_json", PROFILE_QUICK);
  }
}

export async function extractTransactionCandidates(text, context = {}, options = {}) {
  const result = await routeFinancialIntent(text, context, options);
  if (!result.ok) {
    return result;
  }
  return {
    ...result,
    candidates: result.transactions,
  };
}

export async function classifyWalletIntent(text, context = {}, options = {}) {
  const result = await createChatCompletion({
    data: { text, context },
    options,
    profile: PROFILE_QUICK,
    messageBuilder: buildWalletIntentMessages,
  });

  if (!result.ok) {
    return result;
  }

  try {
    const parsed = JSON.parse(stripJsonFence(result.content));
    return {
      ok: true,
      enabled: true,
      provider: result.provider,
      model: result.model,
      profile: result.profile,
      latencyMs: result.latencyMs,
      intent: parsed?.intent ?? "unknown_or_ambiguous",
      wallet: parsed?.wallet ?? null,
      fromWallet: parsed?.fromWallet ?? null,
      toWallet: parsed?.toWallet ?? null,
      amount: parsed?.amount ?? null,
      note: parsed?.note ?? null,
      type: parsed?.type ?? null,
      confidence: parsed?.confidence ?? 0,
      raw: result.content,
    };
  } catch {
    return fallbackResult("invalid_json", PROFILE_QUICK);
  }
}

export async function generateFinanceInsight(data, options = {}) {
  return createChatCompletion({
    data,
    options,
    profile: PROFILE_DEEP,
    messageBuilder: buildInsightMessages,
  });
}

export async function answerFinanceQuestion(question, data, options = {}) {
  return createChatCompletion({
    data: { question, ...data },
    options,
    profile: PROFILE_DEEP,
    messageBuilder: buildFinanceQuestionMessages,
  });
}

export async function generateBudgetSuggestion(data, options = {}) {
  return createChatCompletion({
    data,
    options,
    profile: PROFILE_DEEP,
    messageBuilder: buildBudgetSuggestionMessages,
  });
}

export async function generateWeeklyFinanceReport(data, options = {}) {
  return createChatCompletion({
    data,
    options,
    profile: PROFILE_DEEP,
    messageBuilder: buildWeeklyReportMessages,
  });
}

export async function generateMonthlyFinanceReview(data, options = {}) {
  return createChatCompletion({
    data,
    options,
    profile: PROFILE_DEEP,
    messageBuilder: buildMonthlyReviewMessages,
  });
}

export async function detectFinanceAnomalies(data, options = {}) {
  return createChatCompletion({
    data,
    options,
    profile: PROFILE_DEEP,
    messageBuilder: buildAnomalyDetectionMessages,
  });
}

function buildFinancialIntentRouterMessages(data) {
  return [
    {
      role: "system",
      content: [
        "Kamu adalah router intent keuangan untuk bot Telegram Bahasa Indonesia.",
        "Balas JSON valid saja tanpa Markdown.",
        "Format: {\"intent\":string,\"confidence\":0.0,\"transactions\":[],\"question\":string|null,\"category\":string|null,\"period\":string|null,\"amount\":number|null,\"wallet\":string|null,\"fromWallet\":string|null,\"toWallet\":string|null,\"note\":string|null,\"id\":number|null,\"dayOfMonth\":number|null,\"frequency\":string|null}",
        "Intent yang boleh: transaction_create, transaction_clarify, finance_question, report_request, budget_set, budget_check, wallet_create, wallet_transfer, wallet_balance_query, wallet_balance_set, wallet_balance_adjust, bill_create, recurring_create, search_transaction, edit_transaction, export_csv, help, delete_request, clarification_required, unknown_or_ambiguous.",
        "Untuk transaction_create, isi transactions dengan maksimal 10 item: {type:'income|expense|unknown',amount:number,note:string,category:string,wallet:string|null,confidence:0.0}.",
        "Pilih category hanya dari allowedCategories; jika tidak jelas gunakan other.",
        "Jika tipe pemasukan/pengeluaran ambigu, gunakan transaction_clarify dan type unknown.",
        "Aksi hapus/edit/reset dan set saldo absolut tidak boleh dianggap aman dieksekusi otomatis; route sebagai delete_request atau wallet_balance_set saja.",
        "Jangan mengarang nominal, wallet, kategori, atau tanggal.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        text: String(data?.text ?? ""),
        context: {
          defaultType: data?.context?.defaultType ?? null,
          wallets: Array.isArray(data?.context?.wallets) ? data.context.wallets.slice(0, 10) : [],
          defaultWallet: data?.context?.defaultWallet ?? null,
          allowedCategories: [
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
          ],
        },
      }),
    },
  ];
}

function buildWalletIntentMessages(data) {
  return [
    {
      role: "system",
      content: [
        "Klasifikasikan intent keuangan dompet Bahasa Indonesia.",
        "Balas JSON valid saja.",
        "Intent yang boleh: wallet_create, wallet_balance_set, wallet_balance_adjust, income_save, income_to_wallet, expense_save, expense_from_wallet, wallet_transfer, balance_query, unknown_or_ambiguous.",
        "Format: {\"intent\":string,\"wallet\":string|null,\"fromWallet\":string|null,\"toWallet\":string|null,\"amount\":number|null,\"note\":string|null,\"type\":\"income|expense|null\",\"confidence\":0.0}",
        "Jangan mengarang nominal atau wallet jika tidak jelas.",
        "Jika ambigu, gunakan unknown_or_ambiguous.",
        "Untuk aksi sensitif seperti set saldo dompet, cukup klasifikasikan intent; jangan berasumsi itu aman dieksekusi otomatis.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        text: String(data?.text ?? ""),
        context: {
          wallets: Array.isArray(data?.context?.wallets) ? data.context.wallets.slice(0, 10) : [],
          defaultWallet: data?.context?.defaultWallet ?? null,
          defaultType: data?.context?.defaultType ?? null,
        },
      }),
    },
  ];
}

function buildInsightMessages(data) {
  return [
    {
      role: "system",
      content: [
        "Kamu adalah asisten ringkasan keuangan pribadi.",
        "Jawab dalam Bahasa Indonesia yang singkat dan jelas untuk chat Telegram.",
        "Tulis teks polos tanpa Markdown, tanpa **bold**, tanpa tabel, dan tanpa emoji.",
        "Jangan mengulang semua angka ringkasan; fokus pada 2-3 insight praktis.",
        "Gunakan hanya data yang diberikan.",
        "Jangan mengarang nominal, tanggal, kategori, atau transaksi.",
        "Jika data terbatas, katakan bahwa insight masih terbatas.",
        "Berikan saran praktis, bukan nasihat finansial absolut.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(toSafeInsightPayload(data)),
    },
  ];
}

function buildFinanceQuestionMessages(data) {
  return [
    {
      role: "system",
      content: [
        "Kamu adalah asisten tanya jawab keuangan pribadi.",
        "Jawab dalam Bahasa Indonesia yang singkat untuk Telegram.",
        "Tulis teks polos tanpa Markdown, tanpa **bold**, tanpa tabel, dan tanpa emoji.",
        "Jawab 2-4 kalimat pendek.",
        "Angka utama sudah dihitung oleh aplikasi; gunakan hanya data itu.",
        "Jangan mengulang semua angka ringkasan; rujuk angka yang relevan saja.",
        "Jangan mengarang nominal, tanggal, kategori, atau transaksi.",
        "Jika konteks tidak cukup untuk menjawab, katakan data belum cukup.",
        "Berikan penjelasan praktis, bukan nasihat finansial absolut.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(toSafeQuestionPayload(data)),
    },
  ];
}

function buildBudgetSuggestionMessages(data) {
  return [
    {
      role: "system",
      content: [
        "Kamu adalah asisten budget pribadi.",
        "Jawab dalam Bahasa Indonesia yang singkat untuk Telegram.",
        "Tulis teks polos tanpa Markdown, tanpa **bold**, tanpa tabel, dan tanpa emoji.",
        "Jawab 2-4 kalimat pendek.",
        "Gunakan hanya progress budget dan ringkasan transaksi yang diberikan.",
        "Jangan mengarang nominal, kategori, tanggal, atau budget.",
        "Jika data belum cukup, katakan data belum cukup.",
        "Berikan saran praktis dan hati-hati, bukan nasihat finansial absolut.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(toSafeBudgetPayload(data)),
    },
  ];
}

function buildWeeklyReportMessages(data) {
  return [
    {
      role: "system",
      content: [
        "Kamu adalah asisten laporan mingguan keuangan pribadi.",
        "Jawab dalam Bahasa Indonesia yang singkat untuk Telegram.",
        "Tulis teks polos tanpa Markdown, tanpa **bold**, tanpa tabel, dan tanpa emoji.",
        "Jawab 3-5 kalimat pendek.",
        "Gunakan hanya ringkasan, kategori, budget, dompet, dan transaksi yang diberikan.",
        "Jangan mengarang nominal, tanggal, kategori, budget, atau transaksi.",
        "Sorot pola penting minggu ini dan 1-2 tindak lanjut praktis.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(toSafePeriodicReportPayload(data)),
    },
  ];
}

function buildMonthlyReviewMessages(data) {
  return [
    {
      role: "system",
      content: [
        "Kamu adalah asisten review bulanan keuangan pribadi.",
        "Jawab dalam Bahasa Indonesia yang singkat untuk Telegram.",
        "Tulis teks polos tanpa Markdown, tanpa **bold**, tanpa tabel, dan tanpa emoji.",
        "Jawab 4-6 kalimat pendek.",
        "Gunakan hanya ringkasan, kategori, budget, dompet, dan transaksi yang diberikan.",
        "Jangan mengarang nominal, tanggal, kategori, budget, atau transaksi.",
        "Fokus pada ringkasan bulan, sumber pengeluaran utama, disiplin budget, dan tindak lanjut sederhana.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(toSafePeriodicReportPayload(data)),
    },
  ];
}

function buildAnomalyDetectionMessages(data) {
  return [
    {
      role: "system",
      content: [
        "Kamu adalah asisten deteksi anomali keuangan pribadi.",
        "Jawab dalam Bahasa Indonesia yang singkat untuk Telegram.",
        "Tulis teks polos tanpa Markdown, tanpa **bold**, tanpa tabel, dan tanpa emoji.",
        "Gunakan hanya kandidat anomali yang sudah dihitung aplikasi.",
        "Jangan mengarang nominal, tanggal, kategori, baseline, atau transaksi.",
        "Jika tidak ada sinyal kuat, katakan tidak ada anomali yang menonjol.",
        "Jelaskan kenapa kandidat terlihat menonjol dan sebutkan tindak lanjut praktis.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(toSafeAnomalyPayload(data)),
    },
  ];
}

function toSafeInsightPayload(data) {
  return {
    periodLabel: String(data?.periodLabel ?? "semua waktu"),
    summary: {
      balance: toInteger(data?.summary?.balance),
      totalIncome: toInteger(data?.summary?.totalIncome),
      totalExpense: toInteger(data?.summary?.totalExpense),
      transactionCount: toInteger(data?.summary?.transactionCount),
    },
    categories: Array.isArray(data?.categories)
      ? data.categories.slice(0, 8).map((category) => ({
          category: String(category.category ?? "other"),
          totalIncome: toInteger(category.totalIncome),
          totalExpense: toInteger(category.totalExpense),
          transactionCount: toInteger(category.transactionCount),
        }))
      : [],
    recentTransactions: Array.isArray(data?.recentTransactions)
      ? data.recentTransactions.slice(0, 5).map((transaction) => ({
          type: transaction.type === "income" ? "income" : "expense",
          amount: toInteger(transaction.amount),
          note: String(transaction.note ?? ""),
          category: String(transaction.category ?? "other"),
          createdAt: transaction.createdAt ? String(transaction.createdAt) : null,
        }))
      : [],
  };
}

function toSafeQuestionPayload(data) {
  return {
    question: String(data?.question ?? ""),
    periodLabel: String(data?.periodLabel ?? "semua waktu"),
    summary: {
      balance: toInteger(data?.summary?.balance),
      totalIncome: toInteger(data?.summary?.totalIncome),
      totalExpense: toInteger(data?.summary?.totalExpense),
      transactionCount: toInteger(data?.summary?.transactionCount),
    },
    categories: safeCategories(data?.categories, 8),
    recentTransactions: safeTransactions(data?.recentTransactions, 5),
    matchingTransactions: safeTransactions(data?.matchingTransactions, 5),
    matchingSummary: {
      totalIncome: toInteger(data?.matchingSummary?.totalIncome),
      totalExpense: toInteger(data?.matchingSummary?.totalExpense),
      balance: toInteger(data?.matchingSummary?.balance),
      transactionCount: toInteger(data?.matchingSummary?.transactionCount),
    },
    matchedTerms: Array.isArray(data?.matchedTerms)
      ? data.matchedTerms.slice(0, 5).map((term) => String(term))
      : [],
  };
}

function toSafeBudgetPayload(data) {
  return {
    periodLabel: String(data?.periodLabel ?? "bulan ini"),
    summary: {
      balance: toInteger(data?.summary?.balance),
      totalIncome: toInteger(data?.summary?.totalIncome),
      totalExpense: toInteger(data?.summary?.totalExpense),
      transactionCount: toInteger(data?.summary?.transactionCount),
    },
    budgets: Array.isArray(data?.budgets)
      ? data.budgets.slice(0, 10).map((budget) => ({
          category: String(budget.category ?? "other"),
          monthlyLimit: toInteger(budget.monthlyLimit),
          spent: toInteger(budget.spent),
          remaining: toInteger(budget.remaining),
          percent: toInteger(budget.percent),
          status: String(budget.status ?? "ok"),
        }))
      : [],
  };
}

function toSafePeriodicReportPayload(data) {
  return {
    periodLabel: String(data?.periodLabel ?? "periode ini"),
    summary: {
      balance: toInteger(data?.summary?.balance),
      totalIncome: toInteger(data?.summary?.totalIncome),
      totalExpense: toInteger(data?.summary?.totalExpense),
      transactionCount: toInteger(data?.summary?.transactionCount),
    },
    categories: safeCategories(data?.categories, 8),
    recentTransactions: safeTransactions(data?.recentTransactions, 6),
    budgets: Array.isArray(data?.budgets)
      ? data.budgets.slice(0, 8).map((budget) => ({
          category: String(budget.category ?? "other"),
          monthlyLimit: toInteger(budget.monthlyLimit),
          spent: toInteger(budget.spent),
          remaining: toInteger(budget.remaining),
          percent: toInteger(budget.percent),
          status: String(budget.status ?? "ok"),
        }))
      : [],
    wallets: Array.isArray(data?.wallets)
      ? data.wallets.slice(0, 6).map((wallet) => ({
          name: String(wallet.name ?? "wallet"),
          balance: toInteger(wallet.balance),
          income: toInteger(wallet.income),
          expense: toInteger(wallet.expense),
          transferIn: toInteger(wallet.transferIn),
          transferOut: toInteger(wallet.transferOut),
        }))
      : [],
  };
}

function toSafeAnomalyPayload(data) {
  return {
    periodLabel: String(data?.periodLabel ?? "periode ini"),
    summary: {
      balance: toInteger(data?.summary?.balance),
      totalIncome: toInteger(data?.summary?.totalIncome),
      totalExpense: toInteger(data?.summary?.totalExpense),
      transactionCount: toInteger(data?.summary?.transactionCount),
    },
    anomalies: Array.isArray(data?.anomalies)
      ? data.anomalies.slice(0, 5).map((item) => ({
          id: toInteger(item.id),
          note: String(item.note ?? ""),
          category: String(item.category ?? "other"),
          amount: toInteger(item.amount),
          baseline: toInteger(item.baseline),
          ratio: Number.isFinite(Number(item.ratio)) ? Number(item.ratio) : 0,
          reason: String(item.reason ?? ""),
          createdAt: item.createdAt ? String(item.createdAt) : null,
        }))
      : [],
    recentTransactions: safeTransactions(data?.recentTransactions, 6),
  };
}

function safeCategories(categories, limit) {
  return Array.isArray(categories)
    ? categories.slice(0, limit).map((category) => ({
        category: String(category.category ?? "other"),
        totalIncome: toInteger(category.totalIncome),
        totalExpense: toInteger(category.totalExpense),
        transactionCount: toInteger(category.transactionCount),
      }))
    : [];
}

function safeTransactions(transactions, limit) {
  return Array.isArray(transactions)
    ? transactions.slice(0, limit).map((transaction) => ({
        type: transaction.type === "income" ? "income" : "expense",
        amount: toInteger(transaction.amount),
        note: String(transaction.note ?? ""),
        category: String(transaction.category ?? "other"),
        createdAt: transaction.createdAt ? String(transaction.createdAt) : null,
      }))
    : [];
}

function fallbackResult(reason, profile = PROFILE_DEEP, latencyMs = 0) {
  return {
    ok: false,
    enabled: reason !== "ai_disabled",
    fallback: true,
    reason,
    profile,
    latencyMs,
    content: "",
  };
}

function stripJsonFence(value) {
  return String(value ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function toInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}
