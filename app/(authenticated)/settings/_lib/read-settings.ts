import { withSettingsTimeout } from "@/lib/user-settings/with-timeout";

/** Required admin reads must distinguish an unavailable store from empty data. */
export async function readSettings<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
  const result = await withSettingsTimeout<T | null>(promise, null, timeoutMs);
  if (result === null) throw new Error("Settings read unavailable");
  return result;
}
