import type { Kysely } from "kysely";
import type { Database } from "./types.js";

/**
 * Creates the schema on startup. Kept in the common SQLite/Postgres subset so
 * the same migration runs unchanged when a Postgres dialect is added later.
 */
export async function runMigrations(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("messages")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("channel_id", "text", (c) => c.notNull())
    .addColumn("text", "text", (c) => c.notNull())
    .addColumn("created_at", "integer", (c) => c.notNull())
    .addColumn("updated_at", "integer", (c) => c.notNull())
    .addColumn("seq", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("deleted", "integer", (c) => c.notNull().defaultTo(0))
    .execute();

  await ensureSeqColumn(db);
  await backfillSeq(db);

  // Pull orders by seq; this index keeps that scan cheap.
  await db.schema
    .createIndex("messages_seq")
    .ifNotExists()
    .on("messages")
    .column("seq")
    .execute();

  // Channels sync through the same protocol, so they get the same shape: a
  // server-owned seq cursor and a soft-delete flag. New table — no backfill.
  await db.schema
    .createTable("channels")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("created_at", "integer", (c) => c.notNull())
    .addColumn("updated_at", "integer", (c) => c.notNull())
    .addColumn("seq", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("deleted", "integer", (c) => c.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createIndex("channels_seq")
    .ifNotExists()
    .on("channels")
    .column("seq")
    .execute();

  // Server-only feed configuration. Not part of the sync protocol (no seq /
  // deleted); it just persists each feed's source, schedule, cursor, and status.
  await db.schema
    .createTable("feed_sources")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("type", "text", (c) => c.notNull())
    .addColumn("channel_id", "text", (c) => c.notNull())
    .addColumn("channel_name", "text", (c) => c.notNull())
    .addColumn("cron", "text", (c) => c.notNull())
    .addColumn("enabled", "integer", (c) => c.notNull().defaultTo(1))
    .addColumn("config", "text", (c) => c.notNull().defaultTo("{}"))
    .addColumn("cursor", "text")
    .addColumn("last_run_at", "integer")
    .addColumn("last_status", "text")
    .addColumn("last_error", "text")
    .addColumn("created_at", "integer", (c) => c.notNull())
    .addColumn("updated_at", "integer", (c) => c.notNull())
    .execute();
}

async function ensureSeqColumn(db: Kysely<Database>): Promise<void> {
  const tables = await db.introspection.getTables();
  const messages = tables.find((table) => table.name === "messages");
  const hasSeq = messages?.columns.some((column) => column.name === "seq");

  if (!hasSeq) {
    await db.schema
      .alterTable("messages")
      .addColumn("seq", "integer", (c) => c.notNull().defaultTo(0))
      .execute();
  }
}

async function backfillSeq(db: Kysely<Database>): Promise<void> {
  const maxRow = await db
    .selectFrom("messages")
    .select((eb) => eb.fn.max<number>("seq").as("maxSeq"))
    .executeTakeFirst();
  let seq = Number(maxRow?.maxSeq ?? 0);

  const rows = await db
    .selectFrom("messages")
    .select("id")
    .where("seq", "=", 0)
    .orderBy("updated_at", "asc")
    .orderBy("id", "asc")
    .execute();

  for (const row of rows) {
    seq += 1;
    await db
      .updateTable("messages")
      .set({ seq })
      .where("id", "=", row.id)
      .execute();
  }
}
