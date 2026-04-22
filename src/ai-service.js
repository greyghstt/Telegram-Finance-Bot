import OpenAI from "openai";

const DEFAULT_PROVIDER = "sumopod";
const DEFAULT_BASE_URL = "https://ai.sumopod.com/v1";
const DEFAULT_MODEL = "MiniMax-M2.7-highspeed";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 2500;
const DEFAULT_TIMEOUT_MS = 25000;

export function isAiEnabled(env = process.env) {
  return String(env.AI_ENABLED ?? "false").trim().toLowerCase() === "true";
}

export async function generateFinanceInsight(data, options = {}) {
  return createChatCompletion({
    data,
    options,
    messageBuilder: buildInsightMessages,
  });
}

export async function answerFinanceQuestion(question, data, options = {}) {
  return createChatCompletion({
    data: { question, ...data },
    options,
    messageBuilder: buildFinanceQuestionMessages,
  });
}

export async function generateBudgetSuggestion(data, options = {}) {
  return createChatCompletion({
    data,
    options,
    messageBuilder: buildBudgetSuggestionMessages,
  });
}

export async function extractTransactionCandidates(text, context = {}, options = {}) {
  const result = await createChatCompletion({
    data: { text, context },
    options,
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
      candidates: Array.isArray(parsed?.transactions) ? parsed.transactions : [],
      raw: result.content,
    };
  } catch {
    return fallbackResult("invalid_json");
  }
}

async function createChatCompletion({ data, options, messageBuilder }) {
  const env = options.env ?? process.env;
  const config = readAiConfig(env);

  if (!isAiEnabled(env)) {
    return fallbackResult("ai_disabled");
  }

  if (!config.apiKey) {
    return fallbackResult("missing_api_key");
  }

  try {
    const client = options.client ?? createAiClient(config);
    const completion = await client.chat.completions.create(
      {
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        messages: messageBuilder(data),
      },
      { timeout: config.timeoutMs },
    );
    const content = completion?.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return fallbackResult("empty_response");
    }

    return {
      ok: true,
      enabled: true,
      provider: config.provider,
      model: config.model,
      content,
    };
  } catch {
    return fallbackResult("provider_error");
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

function buildTransactionExtractionMessages(data) {
  return [
    {
      role: "system",
      content: [
        "Ekstrak kandidat transaksi dari teks Bahasa Indonesia.",
        "Balas hanya JSON valid tanpa markdown.",
        "Format: {\"transactions\":[{\"type\":\"income|expense|unknown\",\"amount\":number,\"note\":\"string\",\"category\":\"string\",\"confidence\":0.0}]}",
        "Jangan mengarang nominal. Jika nominal tidak jelas, jangan buat transaksi.",
        "Gunakan type unknown jika pemasukan/pengeluaran ambigu.",
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

function fallbackResult(reason) {
  return {
    ok: false,
    enabled: reason !== "ai_disabled",
    fallback: true,
    reason,
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
