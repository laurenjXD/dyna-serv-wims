/**
 * Prevent an optional settings read from keeping the server component in a
 * permanent loading state when the database connection is slow or unavailable.
 */
export async function withSettingsTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 8000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
