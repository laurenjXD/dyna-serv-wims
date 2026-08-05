# VMI Billing — Tasks

Status: Draft

Sign-off:
- [ ] Technical Lead Sign-off
- [ ] Product/Operations Lead Sign-off

---

## Task Checklist

### 1. Database Schema
- [ ] **Task 12.1: Define VMI Billing Schemas**
  - Create `lib/db/schema/vmi_billing.ts`.
  - Define `vmi_contracts` table (Party ID, CBM Rate).
  - Define `vmi_cbm_ledger` table (Daily running balance: Beginning, Inbound, Outbound, Ending CBM).
  - Define `vmi_billing_statements` table (Snapshot of monthly bill, applied rates, locked forex).
  - Export schemas via `index.ts`.
  - Generate Drizzle migrations and run against DB.

### 2. Backend Logic (Ledger Engine)
- [ ] **Task 12.2: Implement Daily Ledger Aggregation (CRON Job)**
  - Write an API endpoint/server function (`/api/cron/vmi-ledger-sync`).
  - Implement logic to fetch yesterday's ending balance and append today's incoming/outgoing volume derived from `inventory_transactions`.
  - Secure the endpoint to ensure it only runs once per day and prevents duplicate daily entries.

### 3. Dashboard UI & Generation
- [ ] **Task 12.3: VMI Billing Dashboard (Office Admin)**
  - Create the `/dashboard/vmi-billing` UI route.
  - Implement a data table displaying the daily `vmi_cbm_ledger` for an easy audit trail.
  - Implement a "Generate Statement" action that aggregates the selected month's ledger, fetches the live USD to PHP exchange rate, and inserts a locked row into `vmi_billing_statements`.
  - Implement a "View Statement" UI that renders the locked billing statement for export or printing.
