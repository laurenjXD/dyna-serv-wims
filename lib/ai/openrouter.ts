import "server-only";

import { z } from "zod";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_COMPLETION_TOKENS = 800;

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
};

export type OpenRouterTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const completionResponseSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.string().nullable().optional(),
    message: z.object({
      content: z.string().nullable(),
      tool_calls: z.array(z.object({ id: z.string(), type: z.literal("function"), function: z.object({ name: z.string(), arguments: z.string() }) })).optional(),
    }),
  })).min(1),
  model: z.string().optional(),
  usage: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  }).optional(),
});
const embeddingResponseSchema = z.object({
  data: z.array(z.object({
    index: z.number().int().nonnegative(),
    embedding: z.array(z.number().finite()).min(1),
  })).min(1),
  model: z.string().optional(),
  usage: z.object({ prompt_tokens: z.number().optional(), total_tokens: z.number().optional() }).optional(),
});

export type OpenRouterCompletion = {
  answer: string;
  toolCalls: NonNullable<ChatMessage["tool_calls"]>;
  model: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
};

export type OpenRouterEmbeddings = {
  model: string;
  vectors: number[][];
  usage: { promptTokens: number | null; totalTokens: number | null };
};

export class OpenRouterUnavailableError extends Error {
  constructor(readonly reason: "not_configured" | "timeout" | "provider_error" | "invalid_response") {
    super("The AI assistant is temporarily unavailable.");
    this.name = "OpenRouterUnavailableError";
  }
}

function getOpenRouterConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.OPENROUTER_MODEL?.trim();
  const provider = process.env.OPENROUTER_PROVIDER_ONLY?.trim();

  // Model/provider selection is an operator-controlled deployment setting,
  // never a client parameter. Fail closed instead of using OpenRouter defaults.
  if (!apiKey || !model || !provider) {
    throw new OpenRouterUnavailableError("not_configured");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{1,127}$/.test(model)
    || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{1,127}$/.test(provider)) {
    throw new OpenRouterUnavailableError("not_configured");
  }

  return { apiKey, model, provider };
}

async function postOpenRouter(path: "chat/completions" | "embeddings", apiKey: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`https://openrouter.ai/api/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Dyna-Serv WIMS",
        ...(process.env.NEXT_PUBLIC_APP_URL
          ? { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new OpenRouterUnavailableError("timeout");
    }
    throw new OpenRouterUnavailableError("provider_error");
  }

  if (!response.ok) throw new OpenRouterUnavailableError("provider_error");
  try {
    return await response.json();
  } catch {
    throw new OpenRouterUnavailableError("invalid_response");
  }
}

/**
 * Calls the configured OpenRouter route using the privacy requirements in
 * specs/15-ai-chatbot/design.md §8. This module accepts only server-assembled
 * messages and has no database or business-command access.
 */
export async function completeWithOpenRouter(messages: ChatMessage[], tools?: OpenRouterTool[]): Promise<OpenRouterCompletion> {
  if (process.env.AI_CHAT_ENABLED !== "true" || process.env.AI_CHAT_PRIVACY_REVIEWED !== "true") {
    throw new OpenRouterUnavailableError("not_configured");
  }
  const { apiKey, model, provider } = getOpenRouterConfig();
  const payload = await postOpenRouter("chat/completions", apiKey, {
    model,
    messages,
    max_tokens: MAX_COMPLETION_TOKENS,
    temperature: 0.2,
    stream: false,
    ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
    provider: {
      only: [provider],
      allow_fallbacks: false,
      data_collection: "deny",
      zdr: true,
      require_parameters: true,
    },
  });

  const parsed = completionResponseSchema.safeParse(payload);
  const choice = parsed.success ? parsed.data.choices[0] : undefined;
  const answer = choice?.message.content?.trim() ?? "";
  const toolCalls = choice?.message.tool_calls ?? [];
  if (!parsed.success || (!answer && toolCalls.length === 0)) throw new OpenRouterUnavailableError("invalid_response");

  return {
    answer,
    toolCalls,
    model: parsed.data.model ?? model,
    usage: {
      promptTokens: parsed.data.usage?.prompt_tokens ?? null,
      completionTokens: parsed.data.usage?.completion_tokens ?? null,
      totalTokens: parsed.data.usage?.total_tokens ?? null,
    },
  };
}

/** Generates vectors for server-selected, approved knowledge chunks or a user query. */
export async function embedWithOpenRouter(input: string | string[]): Promise<OpenRouterEmbeddings> {
  if (process.env.AI_CHAT_ENABLED !== "true" || process.env.AI_CHAT_PRIVACY_REVIEWED !== "true") {
    throw new OpenRouterUnavailableError("not_configured");
  }
  const { apiKey, provider } = getOpenRouterConfig();
  const model = process.env.OPENROUTER_EMBEDDING_MODEL?.trim();
  const inputs = Array.isArray(input) ? input : [input];
  if (!model || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{1,127}$/.test(model)
    || inputs.length === 0 || inputs.length > 32
    || inputs.some((value) => !value.trim() || value.length > 12_000)) {
    throw new OpenRouterUnavailableError("not_configured");
  }

  const payload = await postOpenRouter("embeddings", apiKey, {
    model,
    input: inputs,
    provider: {
      only: [provider],
      allow_fallbacks: false,
      data_collection: "deny",
      zdr: true,
    },
  });
  const parsed = embeddingResponseSchema.safeParse(payload);
  if (!parsed.success || parsed.data.data.length !== inputs.length) {
    throw new OpenRouterUnavailableError("invalid_response");
  }

  const vectors = [...parsed.data.data]
    .sort((a, b) => a.index - b.index)
    .map(({ embedding }) => embedding);
  if (vectors.some((vector) => vector.length !== 1536)) {
    throw new OpenRouterUnavailableError("invalid_response");
  }

  return {
    model: parsed.data.model ?? model,
    vectors,
    usage: {
      promptTokens: parsed.data.usage?.prompt_tokens ?? null,
      totalTokens: parsed.data.usage?.total_tokens ?? null,
    },
  };
}
