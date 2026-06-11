import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { blobPath } from "./paths.js";
import type { BlobDriver } from "./types.js";

/**
 * Filesystem blob driver: stores each blob as a file at its sharded
 * content-addressed path under the data volume (see {@link blobPath}).
 */
export const filesystemBlobDriver: BlobDriver = {
  name: "filesystem",

  async exists(hash) {
    try {
      await readFile(blobPath(hash));
      return true;
    } catch {
      return false;
    }
  },

  async put(hash, data) {
    if (await this.exists(hash)) return; // content-addressed → bytes never change
    const path = blobPath(hash);
    await mkdir(dirname(path), { recursive: true });
    // Write to a temp file then rename, so a reader never sees a half-written
    // blob and a crash mid-write can't leave a corrupt object at the final path.
    const tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, path);
  },

  async get(hash) {
    try {
      return await readFile(blobPath(hash));
    } catch {
      return null;
    }
  },

  async delete(hash) {
    await rm(blobPath(hash), { force: true });
  },
};
