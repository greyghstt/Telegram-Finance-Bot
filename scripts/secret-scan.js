import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const patterns = [
  /\b\d{8,12}:AA[A-Za-z0-9_-]{30,}\b/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b[A-Za-z0-9_-]*api[_-]?key[A-Za-z0-9_-]*\s*=\s*['\"]?(?!your_|example|<|$)[A-Za-z0-9][A-Za-z0-9_.-]{12,}/gi,
  /\b(?:DATABASE_URL|POSTGRES(?:QL)?_URL)\s*=\s*['\"]?postgres(?:ql)?:\/\/(?!example\b|localhost\b|127\.0\.0\.1\b)[^\s'\"]+/gi,
  /\bpostgres(?:ql)?:\/\/(?!example\b|localhost\b|127\.0\.0\.1\b)[^\s'\"]*:[^\s'\"]+@[^\s'\"]+/gi,
  /\b(?:ADMIN_API_TOKEN|TELEGRAM_WEBHOOK_SECRET|AI_API_KEY)\s*=\s*['\"]?(?!your_|example|<|$)[A-Za-z0-9][A-Za-z0-9_.-]{16,}/g,
];

const findings = [];
const files = listTrackedFiles();

for (const relativePath of files) {
  const fullPath = join(root, relativePath);
  if (!looksTextLike(fullPath)) {
    continue;
  }

  const content = readFileSync(fullPath, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match) {
        findings.push({
          file: relativePath,
          line: index + 1,
          match: match[0],
        });
      }
    }
  });
}

if (findings.length > 0) {
  console.error("Potential secrets found:");
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.match}`);
  }
  process.exit(1);
}

console.log("Secret scan clean.");

function listTrackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function looksTextLike(path) {
  const size = statSync(path).size;
  if (size > 1024 * 1024) {
    return false;
  }

  return !/\.(png|jpg|jpeg|gif|pdf|sqlite|db|lockb|zip|gz|tgz|ico)$/i.test(path);
}
