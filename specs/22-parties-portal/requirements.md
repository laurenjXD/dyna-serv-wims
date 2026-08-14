# Organization Portal — Requirements

Status: Approved
Updated: 2026-08-14 (Aligned with Unified UI/UX & Visual Design System)

## 1. Purpose and scope

This feature is the external-facing self-service surface for Organizations — VMI vendors and Trading/3PL customers — authenticated under the `party_user` role defined in `02-rbac-roles`.

It defines what an Organization user sees and can do once authenticated:
- Their own VMI live inventory position (occupied CBM / lot balances) or Trading order/document history, scoped to their assigned Organization and Inventory Model.
- Their own generated documents (pick lists, Delivery Receipts / Acknowledgement Receipts, VMI billing statements).
- Their own scoped in-app notifications.
- An Organization switcher when assignments span more than one active Organization and/or Inventory Model.
- **Pre-arrival Label Form** (`/portal/labels`) for supplier-initiated barcode pre-labeling of inbound dispatches.

### Terminology Alignment
Across all user-facing portal screens, navigation links, headers, and forms:
- **Organization Portal** replaces Party Portal.
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Delivery Receipt / Acknowledgement Receipt** replaces Acknowledgement Receipt.
- **Pre-arrival Label Form** replaces Supplier Pre-labeling.

*(Note: `parties`, `party_user`, `user_party_scopes`, and `flow_type` remain canonical database identifiers.)*

## 2. Portal Route & Navigation Architecture

The Organization Portal encompasses 6 primary sub-routes:
1. **Organization Home** (`/portal`): Overview dashboard with quick links and active Organization context.
2. **Organization Stock** (`/portal/inventory`): VMI live inventory position and occupied CBM balance.
3. **Orders** (`/portal/orders`): Trading order history and dispatch status.
4. **Documents** (`/portal/documents`): Signed PDF previews/downloads for pick lists, Delivery Receipts / Acknowledgement Receipts, and VMI statements.
5. **Notifications** (`/portal/notifications`): Scoped in-app notification center.
6. **Pre-arrival Label Form** (`/portal/labels`): Thin form for inbound-supplying Organizations to generate 1D barcode shipment labels (`WAN:<uuid>`).

## 3. Functional requirements

### R1. Authentication & Organization Context

1. Authenticates via Supabase Auth under `party_user` role.
2. Server-side context resolution scopes every query to `user_party_scopes`.
3. If multiple assignments exist, presents an explicit Organization/Inventory Model switcher (session-only persistence in v1).

### R2. VMI Stock Position & Trading Order History

1. VMI vendors see live lot balances and occupied CBM from `lot_location_balances`. Item identity uses `party_visible_items` projection (no cost/margin/reorder fields exposed).
2. Trading customers see pick lists and Delivery Receipts / Acknowledgement Receipts with final document price only (no margin or COGS).

### R3. Pre-arrival Label Form (Supplier Inbound Pre-labeling)

1. Available only to Organizations holding an inbound-supplying role (`vendor`/`supplier`).
2. Thin form captures: item (from `party_visible_items`), non-authoritative declared quantity, and optional supplier lot number.
3. Generates a 1D linear barcode label (`WAN:<uuid>`) pointing to a `wrr_advance_notices` record (`shipment_labels.generate` capability).

### R4. Visual Design & 3-Component Error Feedback

1. Employs shared authenticated shell with `surface: "party"`.
2. Solid Level 0 Cream White (`#FFF7ED`) background, Level 1 Solid White (`#FFFFFF`) cards with `#2563EB` Vibrant Blue accents, and Etna Sans Serif + Glacial Indifference typography.
3. Zero glassmorphism or backdrop blur.
4. All portal error states display 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**).

## 4. Acceptance criteria

- [ ] Organization users access only their assigned Organization and Inventory Model data.
- [ ] User-facing UI labels use Organization Portal, Organization, Inventory Model, Delivery Receipt / Acknowledgement Receipt, and Pre-arrival Label Form exclusively.
- [ ] Pre-arrival Label Form generates 1D barcode labels (`WAN:<uuid>`) for inbound-supplying Organizations.
- [ ] 3-component error feedback is present on all portal errors.
- [ ] Visual design system tokens and Etna + Glacial typography are fully applied.
