/**
 * Kysely table interfaces. Column names are snake_case to keep the SQL in the
 * common SQLite/Postgres subset; the sync layer maps to/from the camelCase
 * MessageDoc contract in sync/row.ts.
 */
export interface MessagesTable {
  id: string;
  channel_id: string;
  text: string;
  created_at: number;
  updated_at: number;
  /** server-owned replication cursor */
  seq: number;
  /** 0 | 1 — SQLite has no native boolean */
  deleted: number;
}

export interface Database {
  messages: MessagesTable;
}
