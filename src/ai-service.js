import OpenAI from "openai";

const DEFAULT_PROVIDER = "sumopod";
const DEFAULT_BASE_URL = "https://ai.sumopod.com/v1";
const DEFAULT_MODEL = "MiniMax-M2.7-highspeed";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 2500;
const DEFAULT_TIMEOUT_MS = 30000;
const QUICK_MAX_TOKENS = 700;
const QUICK_TIMEOUT_MS = 18000;
const PROFILE_DEEP = "deep";
const PROFILE_QUICK = "quick";

export function isAiEnabled(env = process.env) {
  return String(env.AI_ENABLED ?? "false").trim().toLowerCase() === "true";
}

export async function createChatCompletion({ data, options = {}, profile = PROFILE_DEEP, messageBuilder }) {
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

function nowMs() {
  return performance.now();
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
