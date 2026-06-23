/**
 * Client for the server-only storage API (`/api/storage/*`). Storage usage and
 * the actual blob bytes live server-side (outside RxDB), so this talks to the
 * endpoints over plain fetch. Bulk deletes are applied server-authoritatively;
 * the soft-deleted attachments then arrive back through normal sync.
 */
import { authFetch } from "../../auth";

export type BlobCategory = "image" | "video" | "pdf" | "other";

export interface StorageUsage {
  blobs: {
    total: { count: number; bytes: number };
    byCategory: Array<{ category: BlobCategory; count: number; bytes: number }>;
  };
  text: {
    messages: number;
    channels: number;
    embeds: number;
  };
}

export interface DeleteAttachmentsResult {
  deleted: number;
  bytesReclaimed: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(url, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`,
    );
  }
  return res.json() as Promise<T>;
}

export function getStorageUsage(): Promise<StorageUsage> {
  return request("/api/storage/usage");
}

export function deleteAttachments(
  ids: string[],
): Promise<DeleteAttachmentsResult> {
  return request("/api/storage/attachments/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}
