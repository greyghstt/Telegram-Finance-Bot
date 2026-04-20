import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getBearerToken,
  hasValidTelegramWebhookSecret,
  safeTokenEqual,
} from "./security.js";

const originalWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const originalVercel = process.env.VERCEL;

describe("security helpers", () => {
  afterEach(() => {
    restoreEnv("TELEGRAM_WEBHOOK_SECRET", originalWebhookSecret);
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("VERCEL", originalVercel);
  });

  it("compares tokens without accepting partial matches", () => {
    assert.equal(safeTokenEqual("abc", "abc"), true);
    assert.equal(safeTokenEqual("abc", "abcd"), false);
    assert.equal(safeTokenEqual("abc", "xyz"), false);
    assert.equal(safeTokenEqual("", "abc"), false);
  });

  it("extracts bearer tokens", () => {
    assert.equal(getBearerToken("Bearer secret"), "secret");
    assert.equal(getBearerToken("bearer secret"), "secret");
    assert.equal(getBearerToken("Token secret"), "");
  });

  it("validates Telegram webhook secret header when configured", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "secret";
    const req = {
      headers: {
        "x-telegram-bot-api-secret-token": "secret",
      },
    };

    assert.equal(hasValidTelegramWebhookSecret(req), true);
    req.headers["x-telegram-bot-api-secret-token"] = "wrong";
    assert.equal(hasValidTelegramWebhookSecret(req), false);
  });

  it("rejects missing Telegram secret in production", () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.NODE_ENV = "production";

    assert.equal(hasValidTelegramWebhookSecret({ headers: {} }), false);
  });
});

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
