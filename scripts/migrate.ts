/**
 * Applies pending migrations to the configured database.
 * Usage: npm run db:migrate
 */
import { sql } from "drizzle-orm";
import { dbDriver, dbReady } from "../src/lib/db";

async function main() {
  const db = await dbReady();
  const res = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  const tables = (res as unknown as { rows: { table_name: string }[] }).rows.map((r) => r.table_name);
  console.log(`✔ migrations applied (driver=${dbDriver()}) — ${tables.length} tables`);
  console.log(tables.join(", "));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
