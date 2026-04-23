import "dotenv/config";
import { resolve } from "node:path";
import { initializeDatabase, openDatabase } from "../src/database.js";
import { exportTransactionsToCsv, writeCsvBackupFile } from "../src/csv-backup.js";

const database = openDatabase(process.env.DATABASE_PATH);
await initializeDatabase(database);

try {
  const exported = await exportTransactionsToCsv(database, { limit: 100000 });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const target = resolve("backups", `telegram-finance-bot-${stamp}.csv`);
  const filePath = writeCsvBackupFile(exported.csv, target);

  console.log(`CSV backup written: ${filePath}`);
  console.log(`Transactions exported: ${exported.count}`);
} finally {
  await database.close();
}
