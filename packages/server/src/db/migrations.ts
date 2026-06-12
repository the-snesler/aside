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
    .addColumn("channel_ids", "text")
    .addColumn("text", "text", (c) => c.notNull())
    .addColumn("created_at", "integer", (c) => c.notNull())
    .addColumn("updated_at", "integer", (c) => c.notNull())
    .addColumn("seq", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("deleted", "integer", (c) => c.notNull().defaultTo(0))
    .execute();

  await ensureSeqColumn(db);
  await ensureMessageChannelIdsColumn(db);
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

  // OpenGraph link-preview sidecars (OG-1/OG-2). Same synced shape as messages —
  // server-owned seq cursor + soft-delete — but written only by the extraction
  // worker. The OpenGraph columns are nullable; a fetch may resolve only some.
  await db.schema
    .createTable("embeds")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("message_id", "text", (c) => c.notNull())
    .addColumn("url", "text", (c) => c.notNull())
    .addColumn("title", "text")
    .addColumn("description", "text")
    .addColumn("image", "text")
    .addColumn("site_name", "text")
    .addColumn("source_updated_at", "integer", (c) => c.notNull())
    .addColumn("created_at", "integer", (c) => c.notNull())
    .addColumn("updated_at", "integer", (c) => c.notNull())
    .addColumn("seq", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("deleted", "integer", (c) => c.notNull().defaultTo(0))
    .execute();

  // Attachments sync through the same protocol as messages/channels, so they
  // get the same shape: a server-owned seq cursor and a soft-delete flag. The
  // bytes live in the blob store; this table only holds metadata + the link to
  // a message. New table — no backfill.
  await db.schema
    .createTable("attachments")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("message_id", "text", (c) => c.notNull())
    .addColumn("blob_hash", "text", (c) => c.notNull())
    .addColumn("file_name", "text", (c) => c.notNull())
    .addColumn("mime_type", "text", (c) => c.notNull())
    .addColumn("size", "integer", (c) => c.notNull())
    .addColumn("created_at", "integer", (c) => c.notNull())
    .addColumn("updated_at", "integer", (c) => c.notNull())
    .addColumn("seq", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("deleted", "integer", (c) => c.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createIndex("embeds_seq")
    .ifNotExists()
    .on("embeds")
    .column("seq")
    .execute();

  // The worker looks up a message's embeds by message_id to refresh/prune them.
  await db.schema
    .createIndex("embeds_message_id")
    .ifNotExists()
    .on("embeds")
    .column("message_id")
    .execute();

  // Synced key-value config (today: the UI theme). Same synced shape as the
  // others — server-owned seq cursor + soft-delete. `value` is an opaque JSON
  // string. New table — no backfill.
  await db.schema
    .createTable("config")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("value", "text", (c) => c.notNull())
    .addColumn("created_at", "integer", (c) => c.notNull())
    .addColumn("updated_at", "integer", (c) => c.notNull())
    .addColumn("seq", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("deleted", "integer", (c) => c.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createIndex("config_seq")
    .ifNotExists()
    .on("config")
    .column("seq")
    .execute();

  // Server-only URL→OpenGraph cache. Not synced (no seq/deleted); dedupes fetches
  // of the same link across messages and negative-caches dead URLs.
  await db.schema
    .createTable("og_cache")
    .ifNotExists()
    .addColumn("url", "text", (c) => c.primaryKey())
    .addColumn("status", "text", (c) => c.notNull())
    .addColumn("payload", "text")
    .addColumn("fetched_at", "integer", (c) => c.notNull())
    .execute();

  await db.schema
    .createIndex("attachments_seq")
    .ifNotExists()
    .on("attachments")
    .column("seq")
    .execute();

  // Render path fetches a message's attachments by message_id.
  await db.schema
    .createIndex("attachments_message_id")
    .ifNotExists()
    .on("attachments")
    .column("message_id")
    .execute();

  // Server-only blob metadata. Not part of the sync protocol (no seq / deleted);
  // it backs the download endpoint's Content-Type. The bytes live in the blob
  // store keyed by `hash`.
  await db.schema
    .createTable("blobs")
    .ifNotExists()
    .addColumn("hash", "text", (c) => c.primaryKey())
    .addColumn("content_type", "text", (c) => c.notNull())
    .addColumn("size", "integer", (c) => c.notNull())
    .addColumn("created_at", "integer", (c) => c.notNull())
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

  // Single-user auth. The owner table intentionally has one stable primary key
  // so first-run setup can be enforced by a normal uniqueness constraint.
  await db.schema
    .createTable("auth_owner")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("password_hash", "text", (c) => c.notNull())
    .addColumn("created_at", "integer", (c) => c.notNull())
    .addColumn("updated_at", "integer", (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("auth_sessions")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("token_hash", "text", (c) => c.notNull().unique())
    .addColumn("created_at", "integer", (c) => c.notNull())
    .addColumn("last_seen_at", "integer", (c) => c.notNull())
    .addColumn("user_agent", "text")
    .addColumn("revoked_at", "integer")
    .execute();

  await db.schema
    .createIndex("auth_sessions_token_hash")
    .ifNotExists()
    .on("auth_sessions")
    .column("token_hash")
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

async function ensureMessageChannelIdsColumn(
  db: Kysely<Database>,
): Promise<void> {
  const tables = await db.introspection.getTables();
  const messages = tables.find((table) => table.name === "messages");
  const hasChannelIds = messages?.columns.some(
    (column) => column.name === "channel_ids",
  );

  if (!hasChannelIds) {
    await db.schema
      .alterTable("messages")
      .addColumn("channel_ids", "text")
      .execute();
  }

  const rows = await db
    .selectFrom("messages")
    .select(["id", "channel_id"])
    .where("channel_ids", "is", null)
    .execute();

  for (const row of rows) {
    await db
      .updateTable("messages")
      .set({ channel_ids: JSON.stringify([row.channel_id]) })
      .where("id", "=", row.id)
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
