import "dotenv/config";
import { argv } from "node:process";
import { initializeDatabase, openDatabase } from "../src/database.js";
import { importTransactionsFromCsv, readCsvBackupFile } from "../src/csv-backup.js";

const filePath = argv[2];
const apply = argv.includes("--apply");

if (!filePath) {
  console.error("Usage: node scripts/import-csv.js <file> [--apply]");
  process.exit(1);
}

const database = openDatabase(process.env.DATABASE_PATH);
await initializeDatabase(database);

try {
  const csv = readCsvBackupFile(filePath);
  const result = await importTransactionsFromCsv(database, csv, { dryRun: !apply });

  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.dryRun) {
    console.log(`Dry run OK. Transactions ready to import: ${result.count}`);
    console.log("Run again with --apply to write into the database.");
  } else {
    console.log(`Transactions imported: ${result.count}`);
  }
} finally {
  await database.close();
}
