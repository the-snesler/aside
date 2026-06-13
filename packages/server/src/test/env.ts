/**
 * Side-effect module that points the server at throwaway storage. Import it as
 * the FIRST import in a test file: ESM evaluates import subgraphs in source
 * order, so this runs before `db/index.ts` constructs its singleton from
 * `DATABASE_URL`, giving each test file its own in-memory SQLite database.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_URL = "sqlite://:memory:";
// Blob bytes and feed profiles land here; isolated per run so nothing leaks.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "aside-test-"));
