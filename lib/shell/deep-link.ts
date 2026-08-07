// Safe post-login return-path validation.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §3.4's "Deep
// link" state row and requirements.md R1.2/R1.3.
//
// This module tests the pure re-authorization/open-redirect-rejection
// decision only. The signed/server-session storage of the pending
// destination and the real Auth round trip are a separate, later
// implementation concern.

import { resolveActiveRouteId } from "./active-route";

export const SAFE_DEEP_LINK_FALLBACK = "/";

function isSafeRelativePath(requestedPath: string): boolean {
  if (typeof requestedPath !== "string" || requestedPath.length === 0) {
    return false;
  }
  // Must start with exactly one "/", never "//" (protocol-relative), never
  // contain a backslash, and never contain a URL scheme delimiter.
  if (!requestedPath.startsWith("/")) return false;
  if (requestedPath.startsWith("//")) return false;
  if (requestedPath.includes("\\")) return false;
  if (requestedPath.includes("://")) return false;
  return true;
}

export function resolveSafeDeepLinkTarget(
  requestedPath: string,
  visibleRouteIds: ReadonlySet<string> | readonly string[],
): string {
  if (!isSafeRelativePath(requestedPath)) {
    return SAFE_DEEP_LINK_FALLBACK;
  }

  const routeId = resolveActiveRouteId(requestedPath);
  if (routeId === null) {
    return SAFE_DEEP_LINK_FALLBACK;
  }

  const idSet =
    visibleRouteIds instanceof Set ? visibleRouteIds : new Set(visibleRouteIds);

  if (!idSet.has(routeId)) {
    return SAFE_DEEP_LINK_FALLBACK;
  }

  return requestedPath;
}
