// Barrel file — re-exports every table module so `lib/db/client.ts` and
// application code import from a single `lib/db/schema` entry point.
//
// Phase 0 scaffolding: every file here is a structural skeleton (id +
// created_at only). Full column definitions land per
// specs/01-core-data-model/design.md once `database-builder` picks up the
// approved 01-core-data-model tasks.md.
export * from "./enums";
export * from "./parties";
export * from "./items";
export * from "./locations";
export * from "./lots";
export * from "./lot_location_balances";
export * from "./commitments";
export * from "./wrr";
export * from "./forex";
export * from "./transactions";
export * from "./audit";
export * from "./pick_lists";
export * from "./rbac";
export * from "./approvals";
export * from "./transfers";
export * from "./documents";
export * from "./notifications";
export * from "./inventory_units";
