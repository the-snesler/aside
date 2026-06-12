import { db } from "../db/index.js";
import type { AiConfigTable } from "../db/types.js";

/** Stable primary key for the single ambient-AI config row. */
export const AI_CONFIG_ID = "default";

/** Default describer sweep: every 6 hours. Descriptions don't need to be fresh. */
const DEFAULT_DESCRIBE_CRON = "0 */6 * * *";

export type AiProvider = "anthropic" | "openai" | "openai-compatible";

/** Server-side config view (carries the raw API key — never send this to a client). */
export interface AiConfig {
  organizerEnabled: boolean;
  describerEnabled: boolean;
  provider: AiProvider;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
  describeCron: string;
  options: Record<string, unknown>;
  lastStatus: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Client-safe view: the key is replaced by a boolean presence flag. */
export type PublicAiConfig = Omit<AiConfig, "apiKey"> & { hasApiKey: boolean };

export interface UpdateAiConfigInput {
  organizerEnabled?: boolean;
  describerEnabled?: boolean;
  provider?: AiProvider;
  model?: string;
  baseUrl?: string | null;
  /** Empty string clears the stored key; omitted leaves it unchanged. */
  apiKey?: string | null;
  describeCron?: string;
  options?: Record<string, unknown>;
}

const DEFAULTS = {
  organizer_enabled: 0,
  describer_enabled: 0,
  provider: "anthropic",
  model: "claude-haiku-4-5",
  base_url: null,
  api_key: null,
  describe_cron: DEFAULT_DESCRIBE_CRON,
  options: "{}",
  last_status: null,
  last_error: null,
} as const;

/** Lazily creates the singleton row on first read, then returns it. */
async function ensureRow(): Promise<AiConfigTable> {
  const existing = await db
    .selectFrom("ai_config")
    .selectAll()
    .where("id", "=", AI_CONFIG_ID)
    .executeTakeFirst();
  if (existing) return existing;

  const now = Date.now();
  await db
    .insertInto("ai_config")
    .values({ id: AI_CONFIG_ID, ...DEFAULTS, created_at: now, updated_at: now })
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();

  // Re-read so a concurrent insert (doNothing) still yields the live row.
  const row = await db
    .selectFrom("ai_config")
    .selectAll()
    .where("id", "=", AI_CONFIG_ID)
    .executeTakeFirst();
  return row!;
}

export async function getAiConfig(): Promise<AiConfig> {
  return rowToConfig(await ensureRow());
}

/** API-facing view with the key masked. */
export async function getAiConfigPublic(): Promise<PublicAiConfig> {
  const { apiKey, ...rest } = await getAiConfig();
  return { ...rest, hasApiKey: !!apiKey };
}

export async function updateAiConfig(
  patch: UpdateAiConfigInput,
): Promise<AiConfig> {
  await ensureRow();
  const set: Partial<AiConfigTable> = { updated_at: Date.now() };
  if (patch.organizerEnabled !== undefined)
    set.organizer_enabled = patch.organizerEnabled ? 1 : 0;
  if (patch.describerEnabled !== undefined)
    set.describer_enabled = patch.describerEnabled ? 1 : 0;
  if (patch.provider !== undefined) set.provider = patch.provider;
  if (patch.model !== undefined) set.model = patch.model.trim();
  if (patch.baseUrl !== undefined) set.base_url = patch.baseUrl?.trim() || null;
  if (patch.apiKey !== undefined)
    set.api_key = patch.apiKey ? patch.apiKey : null;
  if (patch.describeCron !== undefined)
    set.describe_cron = patch.describeCron.trim() || DEFAULT_DESCRIBE_CRON;
  if (patch.options !== undefined) set.options = JSON.stringify(patch.options);

  await db
    .updateTable("ai_config")
    .set(set)
    .where("id", "=", AI_CONFIG_ID)
    .execute();
  return getAiConfig();
}

/** Records the outcome of the last AI run so the settings UI has something to show. */
export async function saveAiStatus(
  status: "ok" | "error",
  error: string | null,
): Promise<void> {
  await ensureRow();
  await db
    .updateTable("ai_config")
    .set({ last_status: status, last_error: error, updated_at: Date.now() })
    .where("id", "=", AI_CONFIG_ID)
    .execute();
}

function rowToConfig(row: AiConfigTable): AiConfig {
  return {
    organizerEnabled: row.organizer_enabled === 1,
    describerEnabled: row.describer_enabled === 1,
    provider: row.provider as AiProvider,
    model: row.model,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    describeCron: row.describe_cron,
    options: parseJson(row.options, {}) as Record<string, unknown>,
    lastStatus: row.last_status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJson(raw: string, fallback: unknown): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
