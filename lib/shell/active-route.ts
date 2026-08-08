<<<<<<< HEAD
// Active-route matching for nested/dynamic/query/trailing-slash paths.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §5 ("Active
// matching uses normalized path segments and explicit dynamic-segment
// rules, not naive string prefixes") and requirements.md R3.6.

import { ROUTE_REGISTRY, type RouteRegistryEntry } from "./registry";

function normalizePath(rawPath: string): string {
  // Strip query string and hash fragment.
  const withoutHash = rawPath.split("#")[0];
  const withoutQuery = withoutHash.split("?")[0];
  // Strip exactly one trailing slash, unless the path is the root itself.
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

export function resolveActiveRouteId(
  currentPath: string,
  registry: readonly RouteRegistryEntry[] = ROUTE_REGISTRY,
): string | null {
  const normalized = normalizePath(currentPath);

  if (normalized === "/") {
    const rootEntry = registry.find((row) => row.path === "/");
    return rootEntry ? rootEntry.id : null;
  }

  const pathSegments = splitSegments(normalized);

  for (const entry of registry) {
    if (entry.path === "/") continue;
    const routeSegments = splitSegments(entry.path);
    if (segmentsMatch(routeSegments, pathSegments)) {
      return entry.id;
    }
  }

  return null;
=======
// Active-route resolution — maps the current pathname to a registry entry ID.
//
// Traceability:
// - specs/05-ui-shell-and-navigation/requirements.md R3.6 (active-route
//   matching handles nested feature routes, query strings, trailing slashes,
//   and dynamic segments without false matches).
// - specs/05-ui-shell-and-navigation/design.md §5 (active matching uses
//   normalized path segments and explicit dynamic-segment rules, not naive
//   string prefixes).
//
// Algorithm:
//   1. Normalize the pathname (strip trailing slash, drop query string).
//   2. Try exact match against static registry paths.
//   3. Try dynamic-segment match: split both the pattern and pathname by "/"
//      and compare segment by segment, treating any segment wrapped in "["
//      as a wildcard. The first match wins.

import { ROUTE_REGISTRY } from "./registry";

/**
 * Returns true iff `pathname` matches the `pattern` under dynamic-segment
 * rules: a pattern segment starting with "[" matches any non-empty path
 * segment at the same position.
 */
function pathMatchesPattern(pattern: string, pathname: string): boolean {
  const patternSegs = pattern.split("/").filter(Boolean);
  const pathSegs = pathname.split("/").filter(Boolean);
  if (patternSegs.length !== pathSegs.length) return false;
  return patternSegs.every(
    (seg, i) => seg.startsWith("[") || seg === pathSegs[i],
  );
}

/**
 * Resolves the registry entry `id` for the given pathname, or null if no
 * entry matches.
 *
 * Dynamic-segment paths (e.g. "/receiving/wrr-123") resolve to the
 * dynamic-segment entry (e.g. "receiving-detail"), not to the static parent
 * (e.g. "receiving"), so that nav link active state is accurate for nested
 * drill-in routes.
 */
export function resolveActiveRouteId(pathname: string): string | null {
  // Strip query string and trailing slash (except root "/").
  const withoutQuery = pathname.split("?")[0];
  const normalized =
    withoutQuery.length > 1 ? withoutQuery.replace(/\/$/, "") : withoutQuery;

  // 1. Exact match — covers all static routes efficiently.
  const exact = ROUTE_REGISTRY.find((e) => e.path === normalized);
  if (exact) return exact.id;

  // 2. Dynamic-segment match — only checked for paths that didn't match
  //    exactly. Pattern entries with "[" are the only candidates.
  const dynamic = ROUTE_REGISTRY.find(
    (e) => e.path.includes("[") && pathMatchesPattern(e.path, normalized),
  );
  return dynamic?.id ?? null;
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
}
