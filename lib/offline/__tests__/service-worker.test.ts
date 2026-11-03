import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const workerSource = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const origin = "https://wims.example";

type WorkerRequest = {
  url: string;
  method: string;
  mode: string;
  headers: Headers;
};

function request(path: string, mode = "navigate", headers?: HeadersInit): WorkerRequest {
  return { url: `${origin}${path}`, method: "GET", mode, headers: new Headers(headers) };
}

function response(body: string) {
  const result = new Response(body);
  Object.defineProperty(result, "type", { value: "basic" });
  return result;
}

function harness() {
  const listeners = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const cacheKey = (key: string | WorkerRequest) => typeof key === "string" ? new URL(key, origin).href : key.url;
  const put = vi.fn();
  const cache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name)!;
    return {
      put: async (key: string | WorkerRequest, value: Response) => { put(key, value); entries.set(cacheKey(key), value); },
      match: async (key: string | WorkerRequest) => entries.get(cacheKey(key)),
      addAll: async (keys: string[]) => {
        for (const key of keys) entries.set(cacheKey(key), response(key === "/offline.html" ? "Offline shell" : "Public asset"));
      },
    };
  };
  const caches = {
    open: vi.fn(async (name: string) => cache(name)),
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => stores.delete(name)),
    match: vi.fn(async (key: string | WorkerRequest) => {
      for (const entries of stores.values()) {
        const value = entries.get(cacheKey(key));
        if (value) return value;
      }
      return undefined;
    }),
  };
  const fetch = vi.fn(async () => response("Live response"));
  const claim = vi.fn(async () => {});
  runInNewContext(workerSource, {
    self: {
      location: { origin },
      addEventListener: (name: string, callback: (event: unknown) => void) => listeners.set(name, callback),
      skipWaiting: vi.fn(async () => {}),
      clients: { claim },
    },
    caches, fetch, URL, Response,
  });
  return {
    stores, caches, put, fetch, claim,
    seed: (name: string, path: string, value: Response) => cache(name).put(path, value),
    lifecycle: async (name: string) => {
      let work: Promise<unknown> | undefined;
      listeners.get(name)!({ waitUntil: (promise: Promise<unknown>) => { work = promise; } });
      await work;
    },
    dispatch: (req: WorkerRequest) => {
      let handled: Promise<Response> | undefined;
      listeners.get("fetch")!({ request: req, respondWith: (promise: Promise<Response>) => { handled = promise; } });
      return handled;
    },
  };
}

describe("service worker public-cache boundary", () => {
  it("never caches successful authenticated document responses", async () => {
    const worker = harness();
    for (const path of ["/inventory", "/reports", "/settings", "/login", "/auth/callback"]) {
      const result = worker.dispatch(request(path));
      if (result) expect(await (await result).text()).toBe("Live response");
    }
    expect(worker.put).not.toHaveBeenCalled();
  });

  it("never replays an old private response, even before old caches are purged", async () => {
    const worker = harness();
    await worker.lifecycle("install");
    await worker.seed("dyna-serv-wims-runtime-v1", "/reports", response("Previous user's financial report"));
    worker.fetch.mockRejectedValue(new TypeError("offline"));
    expect(await (await worker.dispatch(request("/reports"))!).text()).toBe("Offline shell");
  });

  it.each([
    request("/inventory?_rsc=abc", "cors", { RSC: "1" }),
    request("/api/sync", "cors"),
    request("/auth/callback", "cors"),
    request("/login", "cors"),
    request("/some-data.json", "cors"),
    request("/logo.svg?_rsc=abc", "cors", { RSC: "1" }),
  ])("leaves nonpublic fetches to the network without HTML fallbacks: $url", async (req) => {
    const worker = harness();
    await worker.lifecycle("install");
    worker.fetch.mockRejectedValue(new TypeError("offline"));
    expect(worker.dispatch(req)).toBeUndefined();
    expect(worker.put).not.toHaveBeenCalled();
  });

  it("caches and replays only allowlisted public assets from the current shell cache", async () => {
    const worker = harness();
    const asset = request("/logo.svg", "cors");
    expect(await (await worker.dispatch(asset)!).text()).toBe("Live response");
    worker.fetch.mockRejectedValue(new TypeError("offline"));
    expect(await (await worker.dispatch(asset)!).text()).toBe("Live response");
    expect(worker.put).toHaveBeenCalledTimes(1);
  });

  it("does not return HTML when an uncached public asset fails", async () => {
    const worker = harness();
    worker.fetch.mockRejectedValue(new TypeError("offline"));
    await expect(worker.dispatch(request("/logo.svg", "cors"))).rejects.toThrow("offline");
  });

  it("removes this app's old private and shell caches while preserving other applications' caches", async () => {
    const worker = harness();
    await worker.lifecycle("install");
    const currentNames = [...worker.stores.keys()];
    await worker.seed("dyna-serv-wims-shell-v2", "/offline.html", response("Old shell"));
    await worker.seed("dyna-serv-wims-runtime-v1", "/inventory", response("Private"));
    await worker.seed("unrelated-app-cache", "/other", response("Other"));
    await worker.lifecycle("activate");
    expect(worker.stores.has("dyna-serv-wims-shell-v2")).toBe(false);
    expect(worker.stores.has("dyna-serv-wims-runtime-v1")).toBe(false);
    expect(worker.stores.has("unrelated-app-cache")).toBe(true);
    for (const name of currentNames) expect(worker.stores.has(name)).toBe(true);
    expect(worker.claim).toHaveBeenCalledOnce();
  });

  it("does not intercept cross-origin requests or mutations", () => {
    const worker = harness();
    expect(worker.dispatch({ ...request("/logo.svg", "cors"), url: "https://other.example/logo.svg" })).toBeUndefined();
    expect(worker.dispatch({ ...request("/inventory"), method: "POST" })).toBeUndefined();
  });
});
