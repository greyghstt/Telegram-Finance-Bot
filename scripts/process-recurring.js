import "dotenv/config";
import { initializeDatabase, openDatabase, advanceRecurringRule, listDueRecurringRules, saveTransactions } from "../src/database.js";
import { parseInput } from "../src/parser.js";

const database = openDatabase(process.env.DATABASE_PATH);
await initializeDatabase(database);

try {
  const rules = await listDueRecurringRules(database, new Date());
  let savedCount = 0;

  for (const rule of rules) {
    const parsed = parseInput(rule.templateMessage);
    if (!parsed.ok || parsed.kind === "command") {
      console.log(`Skip recurring #${rule.id}: template tidak valid`);
      continue;
    }

    const transactions = parsed.kind === "batch" ? parsed.transactions : [parsed.transaction];
    await saveTransactions(database, transactions);
    await advanceRecurringRule(database, rule.id, nextRecurringRunAt(rule.cadence, new Date(rule.nextRunAt)).toISOString());
    savedCount += transactions.length;
  }

  console.log(`Recurring rules processed: ${rules.length}`);
  console.log(`Transactions saved: ${savedCount}`);
} finally {
  await database.close();
}

function nextRecurringRunAt(cadence, now) {
  const date = new Date(now);
  if (cadence === "daily") {
    date.setUTCDate(date.getUTCDate() + 1);
  } else if (cadence === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7);
  } else {
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return date;
}
