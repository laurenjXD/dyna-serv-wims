import { afterEach, expect, it, vi } from "vitest";
import { readSettings } from "./read-settings";
afterEach(() => vi.useRealTimers());
it("keeps a confirmed empty result distinct from an unavailable read", async () => {
  await expect(readSettings(Promise.resolve([]))).resolves.toEqual([]);
  await expect(readSettings(Promise.reject(new Error("database unavailable")))).rejects.toThrow("Settings read unavailable");
});
it("reports an unavailable read when its deadline expires", async () => {
  vi.useFakeTimers();
  const result = expect(readSettings(new Promise<never>(() => {}), 50)).rejects.toThrow("Settings read unavailable");
  await vi.advanceTimersByTimeAsync(50);
  await result;
});
