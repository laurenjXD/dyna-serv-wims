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
}
