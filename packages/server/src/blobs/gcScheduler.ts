import { Cron } from "croner";
import { runBlobGc } from "./gc.js";

// Daily, off-peak. Override with BLOB_GC_CRON.
const DEFAULT_GC_CRON = "0 4 * * *";

let job: Cron | null = null;

/** (Re)start the periodic orphan-blob sweep. Idempotent: replaces any prior job. */
export function startBlobGc(): void {
  stopBlobGc();
  const pattern = process.env.BLOB_GC_CRON || DEFAULT_GC_CRON;
  try {
    job = new Cron(pattern, { name: "blob-gc", protect: true }, () => {
      void runBlobGcNow();
    });
  } catch (err) {
    console.error(
      `blob gc: invalid cron "${pattern}":`,
      err instanceof Error ? err.message : err,
    );
  }
}

export function stopBlobGc(): void {
  job?.stop();
  job = null;
}

/** Run a sweep now, logging the outcome. Used by the cron tick and bulk deletes. */
export async function runBlobGcNow(): Promise<void> {
  try {
    const result = await runBlobGc();
    if (result.deleted > 0) {
      console.log(
        `blob gc: reclaimed ${result.deleted} blob(s), ${result.bytesReclaimed} bytes`,
      );
    }
  } catch (err) {
    console.error("blob gc failed:", err);
  }
}
