import { sql } from "kysely";
import { db } from "../db/index.js";

export type BlobCategory = "image" | "video" | "pdf" | "other";

const CATEGORY_ORDER: BlobCategory[] = ["image", "video", "pdf", "other"];

export interface StorageUsage {
  blobs: {
    total: { count: number; bytes: number };
    byCategory: Array<{ category: BlobCategory; count: number; bytes: number }>;
  };
  /** Approximate text payload sizes (char length of stored content), in bytes. */
  text: {
    messages: number;
    channels: number;
    embeds: number;
  };
}

/** Bucket a MIME type into one of the coarse storage categories. */
export function categorize(contentType: string): BlobCategory {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType === "application/pdf") return "pdf";
  return "other";
}

/**
 * Total storage use, split into attachment blobs (by file-type category) and
 * the text payloads of synced content. The `blobs` table is small enough to scan
 * and bucket in JS; the text sums are computed in SQL.
 */
export async function getStorageUsage(): Promise<StorageUsage> {
  const blobs = await db
    .selectFrom("blobs")
    .select(["content_type", "size"])
    .execute();

  const buckets = new Map<BlobCategory, { count: number; bytes: number }>();
  for (const category of CATEGORY_ORDER) buckets.set(category, { count: 0, bytes: 0 });
  let totalCount = 0;
  let totalBytes = 0;
  for (const blob of blobs) {
    const bucket = buckets.get(categorize(blob.content_type))!;
    bucket.count += 1;
    bucket.bytes += blob.size;
    totalCount += 1;
    totalBytes += blob.size;
  }

  const [messages, channels, embeds] = await Promise.all([
    db
      .selectFrom("messages")
      .select(sql<number>`coalesce(sum(length(text)), 0)`.as("bytes"))
      .where("deleted", "=", 0)
      .executeTakeFirst(),
    db
      .selectFrom("channels")
      .select(
        sql<number>`coalesce(sum(length(name) + length(coalesce(description, ''))), 0)`.as(
          "bytes",
        ),
      )
      .where("deleted", "=", 0)
      .executeTakeFirst(),
    db
      .selectFrom("embeds")
      .select(
        sql<number>`coalesce(sum(length(url) + length(coalesce(title, '')) + length(coalesce(description, ''))), 0)`.as(
          "bytes",
        ),
      )
      .where("deleted", "=", 0)
      .executeTakeFirst(),
  ]);

  return {
    blobs: {
      total: { count: totalCount, bytes: totalBytes },
      byCategory: CATEGORY_ORDER.map((category) => ({
        category,
        ...buckets.get(category)!,
      })),
    },
    text: {
      messages: Number(messages?.bytes ?? 0),
      channels: Number(channels?.bytes ?? 0),
      embeds: Number(embeds?.bytes ?? 0),
    },
  };
}
