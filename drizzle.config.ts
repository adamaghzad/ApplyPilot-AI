import { defineConfig } from "drizzle-kit";

/**
 * Migrations are generated against an embedded PGlite Postgres database, so no
 * external database is required to author them. The same SQL runs unchanged on
 * a production Postgres instance (see README → "Running on real PostgreSQL").
 */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  driver: "pglite",
  dbCredentials: {
    url: process.env.PGLITE_DATA_DIR ?? "./.pgdata",
  },
  verbose: true,
  strict: true,
});
