/** Browser storage helpers for non-sensitive, tab/session-scoped UI state. */

function getStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function getScopedStorage(kind: "localStorage" | "sessionStorage") {
  return {
    get(key: string): string | null {
      try {
        return getStorage(kind)?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key: string, value: string): void {
      try {
        getStorage(kind)?.setItem(key, value);
      } catch {
        // Storage is an optional continuity aid; callers must still handle
        // IndexedDB persistence failures explicitly.
      }
    },
    remove(key: string): void {
      try {
        getStorage(kind)?.removeItem(key);
      } catch {
        // Ignore unavailable browser storage.
      }
    },
  };
}

export const storage = {
  local: getScopedStorage("localStorage"),
  session: getScopedStorage("sessionStorage"),
};
