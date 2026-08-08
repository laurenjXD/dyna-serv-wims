// Enumerations — specs/01-core-data-model/design.md §1.1
import { pgEnum } from "drizzle-orm/pg-core";

export const partyRoleEnum = pgEnum("party_role", [
  "vendor",
  "supplier",
  "customer",
  "end_customer",
  "internal_warehouse",
]);

export const flowTypeEnum = pgEnum("flow_type", ["vmi", "trading", "supplies"]);

export const locationTypeEnum = pgEnum("location_type", [
  "receiving_bay", // Unloading dock (separate from storage racks)
  "inspection",    // Pre-receiving inspection for TDC/mismatch/damage (not yet incremented in inventory)
  "storage",      // High rack storage slots (A1-01)
  "picking",      // Fast-moving pick face / floor picking staging
  "dispatch",     // Outbound staging area prior to final barcode scan
]);

export const lotStatusEnum = pgEnum("lot_status", [
  "staged",
  "available",
  "quarantined",
  "depleted",
  "expired",
]);

export const wrrStatusEnum = pgEnum("wrr_status", [
  "staged_pending_arrival",
  "receiving_in_progress",
  "confirmed",
  "cancelled",
]);

export const pickListStatusEnum = pgEnum("pick_list_status", [
  "allocated",
  "picked",
  "dispatched",
]);

export const movementTypeEnum = pgEnum("movement_type", [
  "receiving",
  "putaway",
  "pick",
  "transfer",
  "inventory_reconciliation",
]);

export const conformanceStatusEnum = pgEnum("conformance_status", [
  "pending",
  "conformance",       // Passed inspection, paper/barcode match, 0 defect
  "non_conformance",   // Failed inspection (TDC / mismatch / damage)
]);

export const nonConformanceReasonEnum = pgEnum("non_conformance_reason", [
  "tdc_defect",          // Technical Defect Claim
  "quantity_mismatch",   // Paper CIPL vs physical carton count mismatch
  "damaged_carton",      // Damaged packaging or box
  "wrong_item_code",     // Incorrect SKU/part delivered
  "missing_paperwork",   // Missing PEZA permit or IP paperwork
  "other",
]);

export const commitmentStatusEnum = pgEnum("commitment_status", [
  "active",             // Stage 1 reservation is live; qty_committed holds the reservation
  "inspection_pending", // Post-pick disposition sent to further inspection; reservation stays active
  "executed",           // Stage 2 dispatch completed; qty_committed released, qty_executed set
  "released",           // Reservation released without executing (e.g. cancelled before dispatch)
  "expired",            // expires_at passed before execution; reservation released automatically
  "cancelled",          // Manually cancelled before execution
]);

// Approval queue enums — specs/09-approval-queue/design.md §3/§5

export const approvalRequestStatusEnum = pgEnum("approval_request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
  "superseded",
]);

// RBAC enums — specs/02-rbac-roles/design.md §4

export const userProfileStatusEnum = pgEnum("user_profile_status", [
  "invited",
  "active",
  "inactive",
]);

export const scopeKindEnum = pgEnum("scope_kind", ["global", "assigned_party"]);

export const rbacExecutorTypeEnum = pgEnum("rbac_executor_type", [
  "user",
  "system",
  "background_job",
]);

// Exhaustive for v1 (design.md §4.7). Downstream specs adding event types
// must extend this enum with a stable string, never invent ad-hoc strings.
export const rbacEventTypeEnum = pgEnum("rbac_event_type", [
  "user_invited",
  "user_activated",
  "user_deactivated",
  "role_granted",
  "role_revoked",
  "party_scope_granted",
  "party_scope_revoked",
  "sensitive_action_denied",
  "authentication_failed",
  "session_revoked",
  "password_recovery_requested",
  "administrator_invariant_blocked",
]);
