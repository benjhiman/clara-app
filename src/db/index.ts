import "server-only";
import path from "node:path";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const g = globalThis as unknown as { __claraDb?: Promise<DB> };

async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    // prepare:false es necesario con el pooler de Supabase (modo transaction)
    const client = postgres(url, { prepare: false, max: 5 });
    const db = drizzlePg(client, { schema });
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db;
  }
  // Modo demo: base Postgres embebida guardada en .data/
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  const client = dir === "memory" ? new PGlite() : new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!g.__claraDb) {
    g.__claraDb = create().catch((e) => {
      g.__claraDb = undefined;
      throw e;
    });
  }
  return g.__claraDb;
}

export { schema };
