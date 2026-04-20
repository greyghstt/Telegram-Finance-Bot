import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const envPath = ".env";
const updates = {};

if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
  updates.TELEGRAM_WEBHOOK_SECRET = randomBytes(32).toString("base64url");
}

if (!process.env.ADMIN_API_TOKEN) {
  updates.ADMIN_API_TOKEN = randomBytes(32).toString("base64url");
}

if (Object.keys(updates).length > 0) {
  updateEnvFile(envPath, updates);
}

console.log(
  JSON.stringify({
    ok: true,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ? "SET" : "CREATED",
    adminToken: process.env.ADMIN_API_TOKEN ? "SET" : "CREATED",
  }),
);

function updateEnvFile(filePath, values) {
  const seen = new Set();
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const next = lines.map((line) => {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);

    if (!match) {
      return line;
    }

    const key = match[1].trim();

    if (!(key in values)) {
      return line;
    }

    seen.add(key);
    return `${key}=${values[key]}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) {
      next.push(`${key}=${value}`);
    }
  }

  writeFileSync(filePath, next.join("\n"));
}
