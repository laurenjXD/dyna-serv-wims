# Gantt-to-Spec Mapping — Delivery Tracking Layer
Status: Draft

This sits above the spec folders, not inside them. Specs stay feature-level (`requirements.md`/`design.md`/`tasks.md`); this doc is where Gantt line items get traced to the spec(s) that produce them, so "is Milestone 1 on track" can be answered against real spec status instead of guessed at. Update this whenever a spec's status changes or the Gantt itself changes — it's the join table between the two, not a copy of either.

## Milestone 1 — Receiving & Core Transfers (Weeks 1-2)

| Gantt task | Maps to spec(s) | Spec status | Risk |
|---|---|---|---|
| Project setup & repo config | Pre-spec scaffolding | **Paused** — resumes once 01 is approved | Currently blocking, by decision |
| Database schema for inventory & warehouses | 01-core-data-model | Not yet drafted | **Critical path — nothing else in this milestone can proceed until this is approved** |
| User authentication & warehouse roles | 02-rbac-roles | Draft-only (flagged for major revision) | **High** — see below |
| Receiving module UI | 07-incoming-receiving (+ 00-brand-design-system, 05-ui-shell) | Input notes captured (CIPL/WRR), not formalized | Depends on 01 |
| Receiving transaction logic | 07-incomipng-receiving, 01-core-data-model | Same as above | Depends on 01 |
| Product transfer request module | 11-transfer-and-inspection (needs scope check — "transfer request" may be broader than inspection-triggered transfer) | Not yet drafted | Depends on 01 |
| Transfer approval workflow | 09-approval-queue | Not yet drafted | **High** — depends on 02, which is unstable |
| Receiving & transfer validation | Part of 07/11 design.md, not a separate spec | — | Depends on 07, 11 |
| Unit & integration testing | Governed by 00-steering/testing.md | Approved (process), not yet executed | Depends on everything above existing first |
| Milestone 1 Review & Launch | Sign-off gate, not a spec | — | Depends on all above |

**Named risk**: Transfer approval workflow sits on this milestone's critical path and depends on RBAC (02), which is explicitly flagged as expected to change significantly. This is a real scheduling collision, not a hypothetical one — worth resolving RBAC's direction before Milestone 1's approval-workflow work starts, or accepting that piece may slip.

## Milestone 2 — Classification & Logistics Processing (Weeks 3-4)

| Gantt task | Maps to spec(s) | Status |
|---|---|---|
| Product category management | **17-product-categorization-and-classification** (new) | Draft (planning aligned; not approved) |
| Inventory classification logic | **17-product-categorization-and-classification** (new) | Draft (planning aligned; not approved) |
| Barcode/QR integration | Cross-cutting: 01 (`items.barcode_value`), 07 (receiving scan), 18 (packing scan) | Depends on 01, 07 |
| Picking list generation | 10-pick-list-and-acknowledgement-receipt | Not yet drafted |
| Picking workflow | 08-outgoing-withdrawal-and-two-stage-commitment (execution step) | Not yet drafted |
| Packing module UI | **18-packing** (new) | Draft (planning aligned; not approved) |
| Packing confirmation workflow | **18-packing** (new) | Draft (planning aligned; not approved) |
| Logistics process integration | Cross-cutting, not a separate spec | — |
| Testing & bug fixes | testing.md | — |
| Milestone 2 Review & Launch | Sign-off gate | — |

## Milestone 3 — Fulfillment Control & Analytics (Weeks 5-6)

| Gantt task | Maps to spec(s) | Status |
|---|---|---|
| Dispatch scheduling module | **19-dispatch-scheduling-and-delivery-tracking** (new) | Draft (planning aligned; not approved) |
| Dispatch approval workflow | 09-approval-queue + 19 | Draft (planning aligned; not approved) |
| Delivery status tracking | **19-dispatch-scheduling-and-delivery-tracking** (new) | Draft (planning aligned; not approved) |
| Inventory monitoring dashboard | 16-reporting-and-analytics | Draft (planning aligned; not approved) |
| Low-stock notifications | 14-notifications-and-alerts | Not yet drafted |
| Inventory movement history | 16-reporting-and-analytics (queries the `inventory_transactions` ledger from 01) | Draft (planning aligned; not approved) |
| Analytics & reporting | 16-reporting-and-analytics | Draft (planning aligned; not approved) |
| Dashboard optimization | Cross-cutting perf, 04/05 | — |
| System integration testing | testing.md | — |
| Milestone 3 Review & Launch | Sign-off gate | — |

## Milestone 4 — Final Handover & Deployment (Weeks 7-8)

| Gantt task | Maps to spec(s) | Status |
|---|---|---|
| Full system integration, E2E testing, bug fixing | testing.md, cross-cutting | — |
| User Acceptance Testing (UAT) | **20-documentation-training-and-uat** (new) | Not yet drafted |
| Documentation prep, user manual | **20-documentation-training-and-uat** (new) | Not yet drafted |
| Administrator training | **20-documentation-training-and-uat** (new) | Not yet drafted |
| Production deployment | 04-services-and-infrastructure (Option A already locked, see tech.md) | Drafted — provider plans/regions, recovery targets, and operational owners pending approval |
| Final client validation, handover | Project closure, not a spec | — |

## Standing rule
Every time a new spec is drafted or changes status, check this table for rows that reference it and update the status column. This table is only useful if it stays current — treat a stale row here as a bug the same way an undocumented design token is a bug (per brand-design-system.md §13's governance principle).
