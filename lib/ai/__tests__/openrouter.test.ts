import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { completeWithOpenRouter, embedWithOpenRouter, OpenRouterUnavailableError } from "../openrouter";

const envKeys = [
  "AI_CHAT_ENABLED", "AI_CHAT_PRIVACY_REVIEWED", "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL", "OPENROUTER_PROVIDER_ONLY", "OPENROUTER_EMBEDDING_MODEL",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function enableProvider() {
  vi.stubEnv("AI_CHAT_ENABLED", "true");
  vi.stubEnv("AI_CHAT_PRIVACY_REVIEWED", "true");
  vi.stubEnv("OPENROUTER_API_KEY", "test-secret");
  vi.stubEnv("OPENROUTER_MODEL", "example/chat-model");
  vi.stubEnv("OPENROUTER_PROVIDER_ONLY", "example-provider");
  vi.stubEnv("OPENROUTER_EMBEDDING_MODEL", "example/embed-model");
}

describe("OpenRouter privacy boundary", () => {
  it("does not call the provider unless both release flags are enabled", async () => {
    for (const key of envKeys) vi.stubEnv(key, "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeWithOpenRouter([{ role: "user", content: "hello" }]))
      .rejects.toMatchObject({ name: "OpenRouterUnavailableError", reason: "not_configured" });
    await expect(embedWithOpenRouter("hello"))
      .rejects.toMatchObject({ name: "OpenRouterUnavailableError", reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pins one provider and requires ZDR with collection denied and fallback disabled", async () => {
    enableProvider();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "Use the receiving guide. [Source 1]" } }],
      model: "example/chat-model", usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeWithOpenRouter([{ role: "user", content: "How do I receive stock?" }]);
    expect(result.answer).toContain("[Source 1]");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(request.provider).toEqual({
      only: ["example-provider"], allow_fallbacks: false,
      data_collection: "deny", zdr: true, require_parameters: true,
    });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-secret");
  });

  it("rejects embedding vectors with an unexpected dimension", async () => {
    enableProvider();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ index: 0, embedding: [0.1, 0.2] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(embedWithOpenRouter("approved manual text"))
      .rejects.toBeInstanceOf(OpenRouterUnavailableError);
  });
});
