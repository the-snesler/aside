import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AiConfig } from "./config.js";

/**
 * Thrown when the configured provider can't be turned into a usable model —
 * missing key, missing base URL, etc. Callers record it as the AI status rather
 * than crashing the worker.
 */
export class AiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

/** Config key wins; fall back to the provider's conventional env var. */
function resolveApiKey(config: AiConfig): string | undefined {
  if (config.apiKey) return config.apiKey;
  switch (config.provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "openai-compatible":
      return process.env.AI_API_KEY;
    default:
      return undefined;
  }
}

/**
 * Builds a Vercel AI SDK language model from the stored config. Provider-agnostic
 * by design: Anthropic (default), OpenAI, or any OpenAI-compatible endpoint
 * (Ollama / LM Studio / OpenRouter / vLLM …) via a base URL, so a cheaper or
 * self-hosted model can be swapped in without code changes.
 */
export function getModel(config: AiConfig) {
  const apiKey = resolveApiKey(config);

  switch (config.provider) {
    case "anthropic": {
      if (!apiKey)
        throw new AiNotConfiguredError(
          "Anthropic API key is not set (add it in AI settings or ANTHROPIC_API_KEY).",
        );
      return createAnthropic({ apiKey })(config.model);
    }
    case "openai": {
      if (!apiKey)
        throw new AiNotConfiguredError(
          "OpenAI API key is not set (add it in AI settings or OPENAI_API_KEY).",
        );
      return createOpenAI({
        apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })(config.model);
    }
    case "openai-compatible": {
      if (!config.baseUrl)
        throw new AiNotConfiguredError(
          "The openai-compatible provider needs a base URL.",
        );
      return createOpenAICompatible({
        name: "aside-ai",
        baseURL: config.baseUrl,
        // Local endpoints (e.g. Ollama) often need no key — pass it only if set.
        ...(apiKey ? { apiKey } : {}),
      })(config.model);
    }
    default:
      throw new AiNotConfiguredError(
        `Unknown AI provider "${config.provider}".`,
      );
  }
}
