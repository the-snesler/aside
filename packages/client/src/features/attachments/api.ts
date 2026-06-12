/**
 * Blob upload, kept off the RxDB sync path (ATT-2). The bytes go straight to the
 * server over plain fetch; only the returned content hash is stored on the
 * synced attachment document. The matching download is just an `<img src>` /
 * link pointing at `/api/blobs/:hash`.
 */
import { authFetch, authUrl } from "../../auth";

export interface UploadedBlob {
  hash: string;
  size: number;
}

export async function uploadBlob(file: File): Promise<UploadedBlob> {
  const res = await authFetch("/api/blobs", {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `upload failed: ${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`,
    );
  }
  return res.json() as Promise<UploadedBlob>;
}

/** Content-addressed download URL for a stored blob. */
export function blobUrl(hash: string): string {
  return authUrl(`/api/blobs/${hash}`);
}
