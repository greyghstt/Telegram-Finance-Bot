import { timingSafeEqual } from "node:crypto";

export function isProduction() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

export function safeTokenEqual(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  const actualBuffer = Buffer.from(String(actual));
  const expectedBuffer = Buffer.from(String(expected));

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function getBearerToken(headerValue) {
  const value = String(headerValue ?? "").trim();

  if (!value.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return value.slice(7).trim();
}

export function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_API_TOKEN;

  if (!expected && !isProduction()) {
    next();
    return;
  }

  if (!expected) {
    res.status(404).json({ ok: false, error: "Not found" });
    return;
  }

  const provided =
    req.get("x-admin-api-token") ??
    getBearerToken(req.get("authorization"));

  if (!safeTokenEqual(provided, expected)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  next();
}

export function hasValidTelegramWebhookSecret(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expected) {
    return !isProduction();
  }

  const provided = req.headers["x-telegram-bot-api-secret-token"];
  return safeTokenEqual(provided, expected);
}
