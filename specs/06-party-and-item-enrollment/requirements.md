# Organization & Item Enrollment — Requirements

Status: Approved
Updated: 2026-10-22 — Organization role-family correction approved

## 1. Purpose and scope

This feature provides controlled master-data enrollment and maintenance for `parties` (Organizations), `items`, and `locations` used by the VMI, Trading, and Supplies Inventory Models in one physical warehouse. It provides searchable forms, validation, duplicate prevention, lifecycle controls, and safe references to existing categories, Organizations, and physical storage locations. It also provides an Organization-detail action for sending a transactional operational email to an Organization's contact person through the existing services pipeline.

It does not define application roles/RLS, inventory transactions, receiving, pricing finalization, billing, product classification rules, offline synchronization, or the email delivery pipeline (owned by `04-services-and-infrastructure`).

### Terminology Alignment
Across all user-facing enrollment forms, tables, headers, and UI screens:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type. Form hierarchy: Inventory Model dropdown → Category → Subcategory → Item identity/code.
- **Organization Portal** replaces Party Portal.
- **Internal Supplies** replaces Internal Warehouse in user-facing terminology.
- **Material** replaces Items in the enrollment UI; the canonical database table remains `items`.
- **Compliance Fee** groups PEZA compliance, LOA, and Bond fields in user-facing fee forms.
- The enrollment navigation/page may be labeled **Data Management** while retaining `/enrollment` as the stable route during migration.

*(Note: `parties` and `flow_type` remain canonical database identifiers.)*

## 2. Terminology and ownership boundaries

- An `Organization` (`party`) has one or more canonical business classifications: Supplier, Customer, End-Customer, or Internal Supplies. `party_roles` are business classifications, not application-user roles. Legacy `vendor` maps to Supplier and legacy `internal_warehouse` maps to Internal Supplies during migration; neither legacy label is offered for new enrollment.
- An `item` is the shared product master record. The form hierarchy starts with the **Inventory Model** (`vmi`, `trading`, `supplies`) dropdown, followed by Category and Subcategory.
- A `location` is a physical warehouse storage slot (`zone`, `rack`, `level`, `position`, formatted `label`, `location_type`, `max_cbm_capacity`, `is_active`).
- `item_categories` are selected as reference data; hierarchy management belongs to `17-product-categorization-and-classification`.
- Trading pricing belongs to `13-trading-orders-and-pricing`; VMI billing belongs to `12-vmi-billing`.
- Role semantics are explicit: **Supplier** is the Trading-side inbound source/procurement relationship; **Customer** is the company's direct commercial buyer for VMI and Trading and the billable role when used as the commercial customer; **End-Customer** is the non-billable downstream delivery recipient; **Internal Supplies** is for internal warehouse use. A party may hold both Customer and End-Customer classifications, but billing is determined by the transaction's customer/bill-to role, not by the presence of an End-Customer classification. Supplier may also be an End-Customer in a separate relationship. These classifications do not grant application access.
- Flow-specific relationships SHALL be managed separately from business roles: VMI Customer, Trading Customer, and Trading Supplier. A Customer organization may have both VMI Customer and Trading Customer relationships when active in both flows.
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
4. Business roles (Supplier, Customer, End-Customer, Internal Supplies) SHALL be assigned with duplicate checks and server-side validation.
5. Form SHALL distinguish business roles from application-user RBAC roles.
6. Organization deactivation SHALL prevent new operational use while preserving historical audit logs.
7. An authorized user (`parties.manage`) SHALL be able to send transactional operational emails to an Organization's contact person via `04`'s Resend pipeline.
8. Customer enrollment SHALL expose RBE classifications (EE, ELSE, ETC) as checkboxes, require at least one when applicable, and reject more than three selections in the UI, server action, and database constraint.
9. Role-conditioned fields and actions SHALL be enforced server-side: End-Customers SHALL not receive billing or SOA records when used as the recipient; Suppliers are billed directly by Dyna Serv's supplier relationship and are not SOA recipients; Customers are eligible for commercial billing/SOA when they are the transaction's bill-to/customer party.
10. Email generation SHALL support an optional CC field, validated and persisted only through the approved email-delivery pipeline.

### R1a. Data Management and export

1. The enrollment/Data Management surface SHALL provide dedicated subtabs for Organizations, Material, Locations, and authorized exports.
2. Export SHALL be a server-backed action gated by the relevant read capability and SHALL return the complete authorized dataset, not the current page or visible columns only.
3. Exports SHALL use canonical role labels and RBE classifications, exclude data outside the actor's scope, and never grant application access.

### R2. Item enrollment & Inventory Model hierarchy

1. Item creation SHALL follow the mandatory form order: **Inventory Model** (dropdown: VMI, Trading, Supplies) → Category (dropdown) → Subcategory (dropdown) → Item identity/code.
2. Internal `code` and barcode SHALL be unique.
3. Form SHALL validate positive packaging and dimensional metrics (`spq`, `volume_cbm`, weight, reorder level).
4. Conditional fields (`spq_meter`, `boxes_per_pallet`, perishability data) SHALL show only when applicable to the selected Inventory Model and UOM.
5. Material Origin Organization SHALL be selected only from active Organizations with either the `trading_supplier` or `vmi_customer` relationship. Trading Supplier selection SHALL inherit the Trading Inventory Model; VMI Customer selection SHALL inherit the VMI Inventory Model. Trading Customer, End-Customer, Internal Supplies, and Dyna-Serv internal organizations SHALL not appear in this selector.
6. The inherited Inventory Model SHALL be displayed as read-only after the Material Origin Organization is selected. It SHALL be persisted as the Material's default Inventory Model for downstream workflow defaults, while actual lot ownership remains authoritative at receiving: Trading stock is Dyna-Serv-owned and VMI stock is VMI-Customer-owned.
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
- [ ] New enrollment uses only Supplier, Customer, End-Customer, and Internal Supplies; legacy values are migrated and not offered for new records.
- [ ] Customer RBE selection accepts no more than three of EE, ELSE, and ETC, with the same rule enforced server-side and in the database.
- [ ] End-Customers have no billing/SOA output when used as recipients; billing/SOA is resolved from the transaction's Customer/bill-to party for both VMI and Trading.
- [ ] Customer, Supplier, and End-Customer labels and selectors follow their defined relationship semantics; Customer and End-Customer may coexist, but only a transaction using the Customer/bill-to role is billable.
- [ ] Organization management can activate/deactivate VMI Customer, Trading Customer, and Trading Supplier relationships without duplicating the organization.
- [ ] Data Management exports contain the complete authorized result set and preserve canonical role/RBE values.
- [ ] Item enrollment enforces the form order: Inventory Model → Category → Subcategory → Item identity/code.
- [ ] Location labels are auto-generated in `Rack+Level-Position` format with unique DB constraint.
- [ ] User-facing UI labels use Organization, Inventory Model, Organization Portal, and Inspection exclusively.
- [ ] All error surfaces display the 3-component error structure (What, Why, Next Action).
- [ ] Master-data mutations fail closed offline.

## 6. Pending reapproval — Organization role-family correction (2026-10-22)

- **Internal Supplies is an Organization business role and is valid only for
  the Supplies Inventory Model.** It SHALL remain available in Organization
  role enrollment, selectors, filters, exports, and detail views.
- New Organization enrollment SHALL expose Supplier, Customer, End Customer,
  and Internal Supplies. Customer relationships SHALL be explicitly assigned
  as Trading Customer and/or VMI Customer; Supplier is Trading-only; End
  Customer is VMI-only; Internal Supplies is Supplies-only.
- Current `internal_supplies` and deployed legacy `internal_warehouse` data
  SHALL both render as Internal Supplies. The terminology work SHALL preserve
  historical interpretation without data loss, enum replacement, or silent
  reclassification.
