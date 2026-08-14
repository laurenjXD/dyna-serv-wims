# Organization & Item Enrollment — Requirements

Status: Approved
Updated: 2026-08-14 (Aligned with Unified UI/UX & Visual Design System)

## 1. Purpose and scope

This feature provides controlled master-data enrollment and maintenance for `parties` (Organizations), `items`, and `locations` used by the VMI, Trading, and Supplies Inventory Models in one physical warehouse. It provides searchable forms, validation, duplicate prevention, lifecycle controls, and safe references to existing categories, Organizations, and physical storage locations. It also provides an Organization-detail action for sending a transactional operational email to an Organization's contact person through the existing services pipeline.

It does not define application roles/RLS, inventory transactions, receiving, pricing finalization, billing, product classification rules, offline synchronization, or the email delivery pipeline (owned by `04-services-and-infrastructure`).

### Terminology Alignment
Across all user-facing enrollment forms, tables, headers, and UI screens:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type. Form hierarchy: Inventory Model dropdown → Category → Subcategory → Item identity/code.
- **Organization Portal** replaces Party Portal.

*(Note: `parties` and `flow_type` remain canonical database identifiers.)*

## 2. Terminology and ownership boundaries

- An `Organization` (`party`) is a vendor, supplier, customer, end-customer, or internal warehouse entity in the `parties` table. `party_roles` are business classifications, not application-user roles.
- An `item` is the shared product master record. The form hierarchy starts with the **Inventory Model** (`vmi`, `trading`, `supplies`) dropdown, followed by Category and Subcategory.
- A `location` is a physical warehouse storage slot (`zone`, `rack`, `level`, `position`, formatted `label`, `location_type`, `max_cbm_capacity`, `is_active`).
- `item_categories` are selected as reference data; hierarchy management belongs to `17-product-categorization-and-classification`.
- Trading pricing belongs to `13-trading-orders-and-pricing`; VMI billing belongs to `12-vmi-billing`.
- Offline Organization/item/location mutations are prohibited.

## 3. Actors and surfaces

- **Administrators** manage Organization, item, and location master data (`locations.manage`, `parties.manage`, `items.manage`).
- **Supervisors** hold `locations.read`, `parties.read`, `items.read` to review master data.
- **Warehouse staff** consume location and item records on floor handheld devices (`locations.read`).
- Enrollment is an office surface (`/enrollment`, `/master-data/parties`, `/master-data/items`, `/master-data/locations`). Review and lookup remain usable on mobile.

## 4. Functional requirements

### R1. Organization enrollment & maintenance

1. An authorized user SHALL be able to create an Organization with `code`, `name`, contact person, email, phone, tax ID, address lines, payment terms, and notes.
2. Organization code SHALL be required, normalized, and unique.
3. Organization name SHALL be required and validated.
4. Business roles (`vendor`, `supplier`, `customer`, `end_customer`) SHALL be assigned with duplicate checks.
5. Form SHALL distinguish business roles from application-user RBAC roles.
6. Organization deactivation SHALL prevent new operational use while preserving historical audit logs.
7. An authorized user (`parties.manage`) SHALL be able to send transactional operational emails to an Organization's contact person via `04`'s Resend pipeline.

### R2. Item enrollment & Inventory Model hierarchy

1. Item creation SHALL follow the mandatory form order: **Inventory Model** (dropdown: VMI, Trading, Supplies) → Category (dropdown) → Subcategory (dropdown) → Item identity/code.
2. Internal `code` and barcode SHALL be unique.
3. Form SHALL validate positive packaging and dimensional metrics (`spq`, `volume_cbm`, weight, reorder level).
4. Conditional fields (`spq_meter`, `boxes_per_pallet`, perishability data) SHALL show only when applicable to the selected Inventory Model and UOM.
5. Default supplier Organization SHALL be selected from existing authorized Organizations.
6. Item deactivation SHALL prevent new operational use while preserving historical records.

### R3. Location enrollment

1. An authorized user SHALL create `locations` with `zone`, `rack`, `level`, `position`, `location_type`, and `max_cbm_capacity`.
2. The system SHALL auto-generate `label` in `Rack+Level-Position` format (e.g. `A1-01`).
3. `location_type` SHALL be selected from `receiving_bay`, `inspection`, `storage`, `picking`, `dispatch`.
4. `max_cbm_capacity` SHALL be a validated positive decimal.
5. Deactivation (`is_active = false`) SHALL prevent new workflow assignments while preserving historical balances.

### R4. Authorization, accessibility & 3-component error feedback

1. All reads/mutations SHALL be capability-gated via `02-rbac-roles`.
2. All error modals, toasts, or validation failures SHALL display 3 components: **What happened**, **Why it failed**, and **Next Action / Solution**.
3. All forms SHALL consume exact design system tokens (`#2563EB` primary, `#FFF7ED` background, `#FFFFFF` surface, `#0F172A` text primary) and Etna Sans Serif + Glacial Indifference typography.
4. Glassmorphism and backdrop blur are strictly prohibited.

## 5. Acceptance criteria

- [ ] Administrators can create, edit, search, and deactivate Organizations, items, and locations.
- [ ] Item enrollment enforces the form order: Inventory Model → Category → Subcategory → Item identity/code.
- [ ] Location labels are auto-generated in `Rack+Level-Position` format with unique DB constraint.
- [ ] User-facing UI labels use Organization, Inventory Model, Organization Portal, and Inspection exclusively.
- [ ] All error surfaces display the 3-component error structure (What, Why, Next Action).
- [ ] Master-data mutations fail closed offline.
