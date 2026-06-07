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
    .addColumn("deleted", "integer", (c) => c.notNull().defaultTo(0))
    .execute();

  // Pull orders by (updated_at, id); this index keeps that scan cheap.
  await db.schema
    .createIndex("messages_updated_at_id")
    .ifNotExists()
    .on("messages")
    .columns(["updated_at", "id"])
    .execute();
}
