import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect, type Dialect } from "kysely";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { runMigrations } from "./migrations.js";
import { initSequence } from "./sequence.js";
import type { Database } from "./types.js";

/**
 * Dialect switch seam. Today only SQLite is wired; the structure is here so a
 * Postgres dialect (PostgresDialect + pg) can drop in behind DATABASE_URL
 * without touching the sync layer.
 */
function createDialect(): Dialect {
  const url = process.env.DATABASE_URL;

  if (url && url.startsWith("postgres")) {
    throw new Error(
      "Postgres is not implemented yet. TODO: return `new PostgresDialect({ pool: new Pool({ connectionString: url }) })` here.",
    );
  }

  const path = resolveSqlitePath(url);
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new BetterSqlite3(path);
  sqlite.pragma("journal_mode = WAL");
  return new SqliteDialect({ database: sqlite });
}

function resolveSqlitePath(url?: string): string {
  if (url && url.startsWith("sqlite://")) {
    return url.slice("sqlite://".length);
  }
  const dataDir = process.env.DATA_DIR ?? "./data";
  return join(dataDir, "aside.sqlite");
}

export const db = new Kysely<Database>({ dialect: createDialect() });

export async function initDb(): Promise<void> {
  await runMigrations(db);

  // Prime each collection's seq counter from its table so server restarts keep
  // assigning monotonically increasing cursors.
  const messagesMax = await db
    .selectFrom("messages")
    .select((eb) => eb.fn.max<number>("seq").as("maxSeq"))
    .executeTakeFirst();
  initSequence("messages", Number(messagesMax?.maxSeq ?? 0));

  const channelsMax = await db
    .selectFrom("channels")
    .select((eb) => eb.fn.max<number>("seq").as("maxSeq"))
    .executeTakeFirst();
  initSequence("channels", Number(channelsMax?.maxSeq ?? 0));

  const embedsMax = await db
    .selectFrom("embeds")
    .select((eb) => eb.fn.max<number>("seq").as("maxSeq"))
    .executeTakeFirst();
  initSequence("embeds", Number(embedsMax?.maxSeq ?? 0));

  const attachmentsMax = await db
    .selectFrom("attachments")
    .select((eb) => eb.fn.max<number>("seq").as("maxSeq"))
    .executeTakeFirst();
  initSequence("attachments", Number(attachmentsMax?.maxSeq ?? 0));
}
