import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const patterns = [
  /s[k]-[A-Za-z0-9_-]{20,}/g,
  /TELEGRAM_BOT_TOKEN=.*:A[A]/g,
  /DATABASE_URL=postgresq[l]/g,
  /postgresql:\/\/postgre[s]/g,
  /13336512[5]7/g,
  /85736275[6]8/g,
  /AAE[f]/g,
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
