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
}
