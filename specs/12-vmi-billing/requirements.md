# VMI Billing — Requirements

Status: Approved
Updated: 2026-08-14 (Aligned with Unified UI/UX & Visual Design System)

## 1. Purpose and scope

The VMI Billing module automatically tracks physical storage space (Cubic Meters, CBM) occupied by a VMI vendor's inventory on a daily basis and generates authoritative monthly billing statements from those daily records.

### Terminology Alignment
Across all user-facing billing screens, forms, headers, and statement previews:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.

*(Note: `parties` and `flow_type` remain canonical database identifiers.)*

## 2. Actors and access boundaries

- **Supervisor & Administrator** — access billing features via `reporting.financial_read` capability.
- **Organization User** — views authorized VMI billing statements (PDF artifacts) in **Organization Portal** (`/portal/documents`).

## 3. Sub-Tab Architecture

Billing & Pricing (`/billing-pricing`) features 2 primary sub-tabs:
1. **VMI Billing**: Contract configuration, daily CBM ledger inspection, monthly SOA generation, and credit notes.
2. **Trading Pricing**: Customer pricing matrix and trading margin rules.

## 4. Functional requirements

### FR-1: VMI Contracts & Daily CBM Ledger

1. System maintains a `vmi_contracts` record per VMI vendor Organization storing `cbm_rate_usd`, `billing_currency`, and optional contracted threshold.
2. Daily CRON at 23:59 Asia/Manila computes `ending_cbm = SUM(lot_inventory_totals.qty_remaining * items.volume_cbm)` for `flow_type = 'vmi'`.

### FR-2: Statement Generation & Forex Rate Locking

1. Monthly SOA computes `period_average_cbm = AVG(ending_cbm)` over the calendar month.
2. Forex rate (`usd_to_php_rate`) is fetched and locked permanently at generation time.
3. PDF artifacts generate synchronously and send via `04`'s email pipeline to the Organization contact.

### FR-3: Authorization & Visual Design

1. Gated by `reporting.financial_read` capability for Supervisor and Administrator roles.
2. All UI screens consume design tokens (`#2563EB` primary, `#0F172A` text primary, `#64748B` text secondary, `#FFF7ED` background, `#FFFFFF` surface) and Etna Sans Serif + Glacial Indifference typography.
3. All error boundaries display 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**).

## 5. Acceptance criteria

- [ ] Daily CBM ledger calculates occupied CBM per VMI Organization accurately.
- [ ] User-facing UI labels use Organization, Inventory Model, and Organization Portal exclusively.
- [ ] Financial features are gated by `reporting.financial_read` for Supervisor and Administrator.
- [ ] 3-component error feedback is present on all billing/forex errors.
