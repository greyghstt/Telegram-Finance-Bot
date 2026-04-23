import "dotenv/config";
import { initializeDatabase, listDueBillReminders, openDatabase } from "../src/database.js";

const database = openDatabase(process.env.DATABASE_PATH);
await initializeDatabase(database);

try {
  const reminders = await listDueBillReminders(database, new Date());

  console.log(`Bill reminders due today: ${reminders.length}`);
  for (const reminder of reminders) {
    const amount = reminder.amount ? ` - Rp ${new Intl.NumberFormat("id-ID").format(reminder.amount)}` : "";
    console.log(`#${reminder.id} ${reminder.title}${amount}`);
  }
} finally {
  await database.close();
}
