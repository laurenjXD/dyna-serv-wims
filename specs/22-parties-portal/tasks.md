# Organization Portal — Implementation Plan

Status: Approved
Updated: 2026-08-14 (Aligned with Unified UI/UX & Visual Design System)

## Implementation tasks

### 1. Resolve open reconciliation items & route definitions
- [x] Confirm `05-ui-shell-and-navigation` route inventory includes `/portal`, `/portal/inventory`, `/portal/orders`, `/portal/documents`, `/portal/notifications`, and `/portal/labels` with `surface: "party"`.
- [x] Confirm `02-rbac-roles` capability catalog entries for `vmi_statements.read`, `reporting.read`, and `shipment_labels.generate`.

### 2. Authorization/context resolution layer
- [ ] Implement server-side resolution of caller's active `user_party_scopes` assignments on every request.
- [ ] Implement single-assignment auto-default and multi-assignment explicit Organization/Inventory Model switcher.
- [ ] Enforce capability grants (`pick_list.read`, `documents.read`, `notifications.read`, `vmi_statements.read`, `reporting.read`, `shipment_labels.generate`).

### 3. Organization Stock view (`/portal/inventory`)
- [ ] Build scoped `lot_location_balances` read joined to `lots` and `party_visible_items`.
- [ ] Render live VMI lot balances and occupied CBM using solid Level 1 Solid White (`#FFFFFF`) card surfaces on Level 0 Cream White (`#FFF7ED`) background.
- [ ] Enforce 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**) on all data loading errors.

### 4. Orders view (`/portal/orders`)
- [ ] Build `pick_lists` list and order detail view using frozen snapshot fields from `pick_list_items`.
- [ ] Exclude COGS, buying cost, and margin fields from all queries.

### 5. Documents view (`/portal/documents`)
- [ ] Build combined list and preview flow for pick lists, Delivery Receipts / Acknowledgement Receipts, and VMI billing statements via short-lived signed URLs.
- [ ] Preserve mandatory VMI reference price disclaimers.

### 6. Pre-arrival Label Form (`/portal/labels`)
- [ ] Build thin pre-arrival label form (item from `party_visible_items`, non-authoritative declared quantity, optional supplier lot number).
- [ ] Generate 1D barcode shipment labels (`WAN:<uuid>`) pointing to `wrr_advance_notices` (`shipment_labels.generate` capability).

### 7. Visual Design & Error System Audit
- [ ] Verify 100% adherence to Organization Portal terminology, `#2563EB` Vibrant Blue primary color, Etna Sans Serif + Glacial Indifference typography, and zero glassmorphism.
- [ ] Verify 3-component error structure on all error boundaries.
