import OpenAI from "openai";

const DEFAULT_PROVIDER = "sumopod";
const DEFAULT_BASE_URL = "https://ai.sumopod.com/v1";
const DEFAULT_MODEL = "MiniMax-M2.7-highspeed";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 2500;
const DEFAULT_TIMEOUT_MS = 25000;
const QUICK_MAX_TOKENS = 700;
const QUICK_TIMEOUT_MS = 12000;
const PROFILE_DEEP = "deep";
const PROFILE_QUICK = "quick";

export function isAiEnabled(env = process.env) {
  return String(env.AI_ENABLED ?? "false").trim().toLowerCase() === "true";
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

export async function extractTransactionCandidates(text, context = {}, options = {}) {
  const result = await createChatCompletion({
    data: { text, context },
    options,
    profile: PROFILE_QUICK,
    messageBuilder: buildTransactionExtractionMessages,
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
      candidates: Array.isArray(parsed?.transactions) ? parsed.transactions : [],
      raw: result.content,
    };
  } catch {
    return fallbackResult("invalid_json");
  }
}

async function createChatCompletion({ data, options, profile, messageBuilder }) {
  const env = options.env ?? process.env;
  const config = readAiConfig(env);
  const requestConfig = applyAiProfile(config, profile);

  if (!isAiEnabled(env)) {
    return fallbackResult("ai_disabled", profile);
  }

  if (!config.apiKey) {
    return fallbackResult("missing_api_key", profile);
  }

  const startedAt = nowMs();
  try {
    const client = options.client ?? createAiClient(config);
    const completion = await client.chat.completions.create(
      {
        model: requestConfig.model,
        temperature: requestConfig.temperature,
        max_tokens: requestConfig.maxTokens,
        messages: messageBuilder(data),
      },
      { timeout: requestConfig.timeoutMs },
    );
    const content = completion?.choices?.[0]?.message?.content?.trim();
    const latencyMs = elapsedMs(startedAt);

    if (!content) {
      return fallbackResult("empty_response", profile, latencyMs);
    }

    return {
      ok: true,
      enabled: true,
      provider: requestConfig.provider,
      model: requestConfig.model,
      profile: requestConfig.profile,
      latencyMs,
      content,
    };
  } catch {
    return fallbackResult("provider_error", profile, elapsedMs(startedAt));
  }
}

function createAiClient(config) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: config.timeoutMs,
    maxRetries: 0,
  });
}

function readAiConfig(env) {
  return {
    provider: readText(env.AI_PROVIDER, DEFAULT_PROVIDER),
    apiKey: String(env.AI_API_KEY ?? "").trim(),
    baseUrl: readText(env.AI_BASE_URL, DEFAULT_BASE_URL),
    model: readText(env.AI_MODEL, DEFAULT_MODEL),
    temperature: readNumber(env.AI_TEMPERATURE, DEFAULT_TEMPERATURE),
    maxTokens: readInteger(env.AI_MAX_TOKENS, DEFAULT_MAX_TOKENS),
    timeoutMs: readInteger(env.AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  };
}

function applyAiProfile(config, profile = PROFILE_DEEP) {
  if (profile === PROFILE_QUICK) {
    return {
      ...config,
      profile: PROFILE_QUICK,
      maxTokens: Math.min(config.maxTokens, QUICK_MAX_TOKENS),
      timeoutMs: Math.min(config.timeoutMs, QUICK_TIMEOUT_MS),
      temperature: Math.min(config.temperature, 0.1),
    };
  }

  return {
    ...config,
    profile: PROFILE_DEEP,
  };
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

function buildTransactionExtractionMessages(data) {
  return [
    {
      role: "system",
      content: [
        "Ekstrak transaksi Bahasa Indonesia.",
        "Balas JSON valid saja.",
        "Format: {\"transactions\":[{\"type\":\"income|expense|unknown\",\"amount\":number,\"note\":\"string\",\"category\":\"allowed category\",\"confidence\":0.0}]}",
        "Pilih category hanya dari allowedCategories.",
        "Jika kategori tidak jelas gunakan other.",
        "Jangan mengarang nominal.",
        "Maksimal 10 transaksi.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        text: String(data?.text ?? ""),
        context: {
          defaultType: data?.context?.defaultType ?? null,
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

function readText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function readNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function toInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}

function nowMs() {
  return performance.now();
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
