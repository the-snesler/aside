/** A file being uploaded for the next send (ATT-3). */
export interface PendingAttachment {
  tempId: string;
  fileName: string;
  mimeType: string;
  size: number;
  /** object URL for an instant local thumbnail */
  localUrl: string;
  status: "uploading" | "done" | "error";
  /** content hash, set once the upload resolves */
  hash?: string;
}
