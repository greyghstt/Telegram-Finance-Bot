import OpenAI from "openai";

const DEFAULT_PROVIDER = "sumopod";
const DEFAULT_BASE_URL = "https://ai.sumopod.com/v1";
const DEFAULT_MODEL = "MiniMax-M2.7-highspeed";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_TIMEOUT_MS = 15000;

export function isAiEnabled(env = process.env) {
  return String(env.AI_ENABLED ?? "false").trim().toLowerCase() === "true";
}

export async function generateFinanceInsight(data, options = {}) {
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
        messages: buildInsightMessages(data),
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

function fallbackResult(reason) {
  return {
    ok: false,
    enabled: reason !== "ai_disabled",
    fallback: true,
    reason,
    content: "",
  };
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
