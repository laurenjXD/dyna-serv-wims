// Role resolution + permission checks, per specs/02-rbac-roles.
// Resolved from session server-side, never from a client-supplied
// parameter (tech.md).
//
// Cycles 2.2/2.3 implemented and rbac-rls-reviewer-passed 2026-08-07.
// Cycle 2.4 (RLS policies) is not yet built — an "authorized" result
// from requirePermission() does NOT verify the specific row being
// acted on belongs to the caller's scope (design.md §3.3 steps 4/5).
// Callers must still filter their own queries by scope until RLS lands.
export * from "./session";
export * from "./guard";
