import type { AttachmentDoc, ChannelDoc, MessageDoc } from "@aside/shared";
import {
  addRxPlugin,
  createRxDatabase,
  type RxCollection,
  type RxDatabase,
} from "rxdb";
import { RxDBDevModePlugin } from "rxdb/plugins/dev-mode";
import { RxDBMigrationSchemaPlugin } from "rxdb/plugins/migration-schema";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { wrappedValidateAjvStorage } from "rxdb/plugins/validate-ajv";
import { collections } from "./collections";

addRxPlugin(RxDBMigrationSchemaPlugin);

if (import.meta.env.DEV) {
  addRxPlugin(RxDBDevModePlugin);
}

// The dev-mode plugin requires the storage to be wrapped in a schema validator
// (error DVM1). In prod we skip the validator for performance.
const storage = import.meta.env.DEV
  ? wrappedValidateAjvStorage({ storage: getRxStorageDexie() })
  : getRxStorageDexie();

export type MessageCollection = RxCollection<MessageDoc>;
export type ChannelCollection = RxCollection<ChannelDoc>;
export type AttachmentCollection = RxCollection<AttachmentDoc>;
export interface AsideCollections {
  messages: MessageCollection;
  channels: ChannelCollection;
  attachments: AttachmentCollection;
}
export type AsideDatabase = RxDatabase<AsideCollections>;

let dbPromise: Promise<AsideDatabase> | null = null;

/**
 * Memoized singleton. RxDB throws if a database of the same name is created
 * twice, so we build it once at module scope rather than inside a React effect.
 */
export function getDatabase(): Promise<AsideDatabase> {
  if (!dbPromise) dbPromise = createDatabase();
  return dbPromise;
}

async function createDatabase(): Promise<AsideDatabase> {
  const db = await createRxDatabase<AsideCollections>({
    name: "asidedb",
    storage,
    multiInstance: true,
    eventReduce: true,
  });
  await db.addCollections(collections);
  return db;
}
