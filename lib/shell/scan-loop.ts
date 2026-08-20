// Scan-flow route matching.
//
// Traceability: specs/05-ui-shell-and-navigation/requirements.md R4.3
// ("During an active scan-driven floor flow, navigation SHALL be completely
// hidden and replaced by a feature-owned flow header with only an
// exit/cancel action. Bottom tabs appear only between scan steps.") and
// tasks.md §4.
//
// This is deliberately a whole-page ROUTE check -- navigation is hidden for
// the entire duration one of the registered scan-flow pages is open, not
// per-scan-step state within that page. That is a confirmed product
// decision (2026-08-16), not a simplification to revisit later.
//
// Matching follows the same approach as lib/shell/active-route.ts: segment
// arrays compared by count and position, with bracketed segments treated as
// dynamic wildcards.

const SCAN_LOOP_ROUTES = [
  "/receiving/[wrrId]/receive",
  "/pick-lists/[pickListId]/pick",
  "/pick-lists/[pickListId]/dispatch",
  "/transfers/[transferId]/execute",
  "/transfers/[transferId]/inspect",
] as const;

function normalizePath(rawPath: string): string {
  const withoutHash = rawPath.split("#")[0];
  const withoutQuery = withoutHash.split("?")[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

function splitSegments(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

function segmentsMatch(routeSegments: string[], pathSegments: string[]): boolean {
  if (routeSegments.length !== pathSegments.length) return false;
  for (let i = 0; i < routeSegments.length; i += 1) {
    const routeSegment = routeSegments[i];
    const isDynamic = routeSegment.startsWith("[") && routeSegment.endsWith("]");
    if (isDynamic) continue;
    if (routeSegment !== pathSegments[i]) return false;
  }
  return true;
}

export function isScanLoopRoute(pathname: string): boolean {
  const pathSegments = splitSegments(normalizePath(pathname));
  return SCAN_LOOP_ROUTES.some((route) => segmentsMatch(splitSegments(route), pathSegments));
}
