# Billing & Pricing Implementation Plan

Status: Active implementation plan
Updated: 2026-09-12

This plan converts the approved `12-vmi-billing` and
`13-trading-orders-and-pricing` tasks into one shippable Billing & Pricing
workstream. It also defines the Gantt completion gates for the billing-related
rows.

## 1. Outcome

Deliver one office workflow that can:

1. show billing and pricing work that needs attention;
2. calculate a VMI organization's period charges from immutable movement data;
3. review and close a VMI billing period;
4. generate and securely deliver the four VMI documents;
5. record payments and corrections without rewriting issued history;
6. import Trading purchase-cost evidence from supplier documents;
7. configure Trading sell prices and freeze the final price at pick-list generation;
8. expose margin only to authorized internal users.

The target navigation is:

```text
Billing & Pricing
├── Overview
├── VMI Billing
├── Trading Pricing
└── Configuration
```

The current functions are reorganized, not discarded:

| Current surface | Target location |
|---|---|
| VMI Storage Ledger | VMI Billing / Storage Ledger |
| Statement of Account | VMI Billing / SOA |
| Trading Margin Ledger | Trading Pricing / Margin Ledger |
| Logistics Rate Matrix | Configuration / Logistics Rates |
| Commercial Contracts | Configuration / VMI Contracts |

Supplier Commercial Invoice, Packing List, and Weight Information are
receiving/import evidence. They should feed Trading purchase-cost and
receiving data, but should not become unstructured content inside the Billing
screen.

## 2. Current baseline

### VMI (`12-vmi-billing`)

Already implemented and tested:

- VMI billing schema and migration;
- movement shaping from `inventory_transactions`;
- daily CBM replay and storage charges;
- effective-dated rate resolution and historical backfill;
- nightly Supabase Cron/Edge Function pipeline;
- handling, documentation, delivery, recurring-fee aggregation;
- exact FX locking;
- SOA running-balance calculation;
- period-number generation;
- draft period-close command.

Remaining completion work:

- D.9 four-document generation;
- D.10 Resend delivery;
- D.11 correction and void/reissue flow;
- D.9-D.12 document generation/delivery/correction completion; payment
  recording now carries post-issue payments into the next period's opening SOA
  balance without rewriting the issued snapshot;
- E.2-E.6 VMI ledger/charge/configuration/close-flow completion;
- F.6 live RLS verification and administrator-only capability finalization;
- fixture-backed integration, E2E, and manual document QA.

### Trading (`13-trading-orders-and-pricing`)

Already implemented and tested:

- trading rate-card schema and purchase/sale invoice-line schema;
- trading capabilities and default-deny RLS;
- decimal-safe margin and currency calculation;
- price resolution and immutable hashed freeze;
- authorized price override and margin redaction.

Remaining completion work:

- resolve and record tax, discount, return, and post-dispatch correction policy;
- rate-card CRUD UI;
- supplier commercial-invoice parser and purchase-side ingestion;
- integration into `08` pick-list generation;
- consumption by `10` document rendering;
- Trading Pricing and Margin Ledger UI;
- retry/idempotency/offline-boundary tests and final reviews.

### Shared dependency

The highest-leverage dependency is completing the approved `04`/`10` document
artifact pipeline. The repository already has a Documents Center,
document-specific tables/actions, private download routes, and a SOA PDF
generator. The remaining work is to make those pieces one consistent pipeline
for floor and financial documents, with shared private Storage metadata,
hash/version tracking, retry and attention states, signed access, and
append-only generation events.

## 3. Delivery sequence

### Phase 0 — Rebaseline and fixture contract

**Goal:** make the data and Gantt measurable before adding more screens.

- Confirm the June VMI fixture remains the regression fixture:
  `792.02` beginning CBM, `157.18` IN, `262.96` OUT, `686.24` ending CBM,
  `$1,116.90` storage, and `$3,023.80` statement total.
- Register the Trading fixture `PR260026P` as purchase-side evidence.
- Preserve line-level UOM; flag the mixed `PC`/`M` totals for review instead of
  treating the grand total as a single-unit quantity.
- Record that the supplier invoice's `$8,608.76` is Trading buy-cost evidence,
  not a customer invoice, VMI charge, or SOA amount.
- Rebaseline the Gantt using the gates in Section 6.

**Exit gate:** product/finance confirms the fixture meaning and all billing
numbers have an identified source.

### Phase 1 — Shared document artifact pipeline

**Goal:** create one reliable document foundation used by floor, financial,
and Trading documents.

- Implement the shared PDF renderer and template contract from `04` and `10`.
- Support private Storage paths, MIME/size/page/hash validation, template
  version, source reference, status, and correlation metadata.
- Implement `pending → generating → generated | failed` state handling.
- Add bounded idempotent retry and visible generation-attention states.
- Implement signed preview/download URLs and append-only generation/reprint
  events.
- Prove document failure never rolls back inventory or a completed billing
  calculation.

**Exit gate:** a committed pick list can produce a private previewable PDF,
and a failed render can be retried without duplicate artifacts.

### Phase 2 — VMI billing vertical slice

**Goal:** make one complete VMI period close work from calculation to issued
documents.

- Implement D.9: generate Billing Statement, Warehousing Charges, SOA, and
  LOA from one period-close action.
- Keep the period in `draft` if any document fails.
- Implement D.10: email all four PDFs through Resend and support authorized
  redelivery.
- Implement D.12: Administrator-only payment, credit memo, and adjustment
  recording with correct draft/issued-period behavior.
- Implement D.11: void and reissue with revision suffix and supersession link.
- Add RLS for all seven VMI tables and complete the RBAC review.

**Exit gate:** June fixture closes successfully, produces four PDFs, preserves
the expected totals, sends/retries safely, and carries the SOA balance into
the next period.

### Phase 3 — Billing workspace UI

**Goal:** expose the workflow without overwhelming the user.

The current `/billing-pricing` page already contains the VMI Storage Ledger,
Trading Margin Ledger, Logistics Rate Matrix, Commercial Contracts, SOA
directory/detail, VMI contract screens, Trading policy/rate-card controls,
and supporting table components. This phase is therefore an information
architecture and workflow-completion phase, not a page-from-scratch build.

The direct `/billing-pricing/vmi` route and `/billing-pricing/vmi/periods/[periodId]`
detail route are now available. The detail route includes SOA balances,
payment history, Administrator-only payment entry, and pre-issue charge-line
entry tied to acknowledgement receipts; remaining work is the four-document
links/actions, charge-line editing, and period correction/redelivery controls.

Build the page in this order:

1. **Overview** — current period, accrued totals, organizations needing
   attention, ready-to-close periods, and recent issued documents.
2. **VMI Billing** — organization selector, summary, daily CBM ledger,
   charge lines, SOA, payments, period preview, and issued documents.
3. **Trading Pricing** — rate cards, price exceptions, frozen sale prices,
   and margin ledger.
4. **Configuration** — contracts, recurring fees, permits/LOA, logistics
   rates, and FX rates.

Use progressive disclosure: summary first, exceptions second, detailed tables
only after the user selects an organization or period. Every screen has one
primary action and a clear status: `Accruing`, `Needs attention`, `Ready to
close`, `Issued`, or `Payment pending`.

**Exit gate:** an authorized office user can select an organization, review
the period, resolve exceptions, preview all four documents, close the period,
and view the resulting document links without using a raw database or admin
command.

### Phase 4 — Trading purchase and sale flow

- Implement the `PR260026P`-style parser for commercial invoice lines.
- Map parsed lines to Trading purchase `trading_invoice_lines` and the
  approved receiving/inventory path; never silently update the standing rate
  card.
- Build rate-card CRUD for `(customer, item)`.
- Resolve tax, discount, returns, and post-dispatch correction policy and
  record it in the revision log.
- Wire frozen Trading prices into `08` pick-list generation.
- Make `10` render the exact frozen snapshot on pick lists and
  acknowledgement receipts.
- Build the Trading Pricing and Margin Ledger tab with cost/margin redaction.

**Exit gate:** a configured Trading item can move from purchase evidence to
  priced pick list and acknowledgement receipt; an unconfigured item blocks
  cleanly; later rate changes do not alter the frozen document.

### Phase 5 — Verification and release

- Run unit tests, real-Postgres migration/RLS tests, and Playwright flows.
- Run `rbac-rls-reviewer`, `design-system-auditor`, and
  `db-migration-verifier`.
- Perform printed-PDF review for page breaks, totals, currency labels,
  identifiers, and readability.
- Validate office mobile widths and keyboard/accessibility behavior.
- Confirm no margin/cost leakage to Organization Portal users.
- Update the Gantt only after each exit gate passes.

## 4. Today's high-leverage vertical slice

The most valuable single-day target is not every billing screen. It is a
demonstrable VMI close path:

```text
Existing VMI calculation
  → shared PDF artifact contract
  → four-document preview
  → draft period record
  → retry/attention state
```

If time remains, add the Overview shell and connect it to the existing VMI
calculation services. Do not mark the period as `issued` until document
generation, Storage, authorization, and regression checks pass.

## 5. Definition of complete

Billing is complete only when all of these are true:

- VMI period close is a single atomic business action.
- Storage and handling are derived from movement history, not hand-entered
  totals.
- Delivery remains a manual PHP charge converted using locked FX.
- Four VMI documents are generated together and share period/revision data.
- Issued periods are immutable; corrections void and reissue.
- Payments are Administrator-only and preserve running SOA history.
- Trading purchase invoices inform cost evidence but do not silently set sale
  prices.
- Trading sale prices are frozen before commitment and reused verbatim by
  documents.
- Private document access, RLS, audit events, retries, and redaction are
  verified.
- June VMI and `PR260026P` Trading fixtures pass regression and manual review.

## 6. Gantt-ready completion rows

Use these rows under the Billing & Pricing section. Percentages are exit-gate
percentages, not raw checkbox counts.

| Gantt row | Current baseline | Completion target | Definition of done |
|---|---:|---:|---|
| VMI daily CBM engine | 60% | 100% | Existing calculation engine plus regression, RLS, UI, and close-path verification |
| VMI period close and four documents | 35% | 100% | D.9-D.12 complete; four PDFs, payments, correction, delivery, and E2E pass |
| Billing Overview / VMI workspace | 40% | 100% | Existing ledger/contracts/SOA surfaces reorganized into the Overview → organization → review → close workflow; E.1-E.8 complete |
| Trading cost, pricing, and margin | 55% | 100% | Existing policy/rate-card/margin surfaces plus purchase import, `08`/`10` integration, and remaining policy decisions |
| Shared PDF and artifact pipeline | 25% | 100% | Existing Documents Center/SOA generator unified with `04`/`10` renderer, private Storage, retry, hash, signed access, and events |
| Gantt and release verification | 20% | 100% | Full test matrix, reviewer sign-offs, fixture QA, updated status evidence |

Recommended status sequence:

```text
Not started
  → Foundation ready
  → Backend ready
  → UI ready
  → End-to-end verified
  → Released
```

Do not use `100%` for a row merely because its schema or backend service
exists. A row reaches `100%` only at its documented exit gate.

## 7. Source specifications

- `specs/12-vmi-billing/requirements.md`
- `specs/12-vmi-billing/design.md`
- `specs/12-vmi-billing/tasks.md`
- `specs/13-trading-orders-and-pricing/requirements.md`
- `specs/13-trading-orders-and-pricing/design.md`
- `specs/13-trading-orders-and-pricing/tasks.md`
- `specs/10-pick-list-and-acknowledgement-receipt/tasks.md`
- `specs/04-services-and-infrastructure/tasks.md`
