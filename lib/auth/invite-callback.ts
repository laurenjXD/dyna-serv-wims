const DEFAULT_INVITE_PATH = "/accept-invite";

export function getSafeCallbackPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return DEFAULT_INVITE_PATH;
  }
  return next;
}
