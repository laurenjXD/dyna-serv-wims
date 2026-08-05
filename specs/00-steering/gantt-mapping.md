# Gantt-to-Spec Mapping — Delivery Tracking Layer
Status: Active
Last Updated: 2026-08-05

This sits above the spec folders, not inside them. Because we follow **Spec-Driven Development** (no implementation code is written until `tasks.md` is Approved), the traditional Gantt chart tasks are split to reflect our actual flow. 

The current Gantt timeline tracks the **Spec Definition Phase** (Drafting Requirements $\rightarrow$ Design $\rightarrow$ Tasks $\rightarrow$ Approval) before unlocking the **Implementation Phase**. The progress percentages below currently reflect progress in *Spec Drafting*, not coding.

---

## Milestone 1 — Receiving & Core Transfers (Weeks 1–2)

| # | Gantt task | Schedule | Overall % | Mapped spec(s) | Spec Status (Drafting / Approved) | Implementation Status |
|---|---|---|---|---|---|---|
| 1.1 | Project setup & repo config | 7/31 – 8/5 | 70% | Pre-spec scaffolding | **Paused** (Awaiting Spec 01) | Not Started |
| 1.2 | Database schema for inventory | 7/31 – 8/5 | 80% | `01-core-data-model` | **Spec Approved** | Ready for Dev |
| 1.3 | User auth & warehouse roles | 7/31 – 8/5 | 30% | `02-rbac-roles` | **Drafting** (Needs revision) | Not Started (Blocked by Spec) |
| 1.4 | Receiving module UI | 7/31 – 8/5 | 0% | `07-incoming-receiving`, `05-ui-shell` | **Pending** (Input notes only) | Not Started (Blocked by Spec) |
| 1.5 | Receiving transaction logic | 7/31 – 8/5 | 0% | `07-incoming-receiving` | **Pending** (Input notes only) | Not Started (Blocked by Spec) |
| 1.6 | Product transfer request | 8/6 – 8/11 | 0% | `11-transfer-and-inspection` | **Not Started** | Not Started (Blocked by Spec) |
| 1.7 | Transfer approval workflow | 8/6 – 8/11 | 0% | `09-approval-queue` | **Not Started** (Risk: Depends on 02) | Not Started (Blocked by Spec) |
| 1.8 | Receiving & transfer validation | 8/6 – 8/11 | 0% | Part of `07` & `11` | **Not Started** | Not Started (Blocked by Spec) |
| 1.9 | Unit & integration testing | 8/6 – 8/11 | 0% | `testing.md` | **Process Approved** | Not Started (Awaiting code) |
| 1.10 | Milestone 1 Review & Launch | — | 0% | Sign-off gate | **Not Started** | Not Started |

---

## Milestone 2 — Classification & Logistics Processing (Weeks 3–4)

| Gantt task | Maps to spec(s) | Status |
|---|---|---|
| Product category management | **17-product-categorization-and-classification** (new) | Not yet drafted |
| Inventory classification logic | **17-product-categorization-and-classification** (new) | Not yet drafted |
| Barcode/QR integration | Cross-cutting: 01 (`items.barcode_value`), 07 (receiving scan), 18 (packing scan) | Depends on 01, 07 |
| Picking list generation | 10-pick-list-and-acknowledgement-receipt | Not yet drafted |
| Picking workflow | 08-outgoing-withdrawal-and-two-stage-commitment (execution step) | Not yet drafted |
| Packing module UI | **18-packing** (new) | Not yet drafted |
| Packing confirmation workflow | **18-packing** (new) | Not yet drafted |
| Logistics process integration | Cross-cutting, not a separate spec | — |
| Testing & bug fixes | testing.md | — |
| Milestone 2 Review & Launch | Sign-off gate | — |

## Milestone 3 — Fulfillment Control & Analytics (Weeks 5–6)

| Gantt task | Maps to spec(s) | Status |
|---|---|---|
| Dispatch scheduling module | **19-dispatch-scheduling-and-delivery-tracking** (new) | Not yet drafted |
| Dispatch approval workflow | 09-approval-queue + 19 | Not yet drafted |
| Delivery status tracking | **19-dispatch-scheduling-and-delivery-tracking** (new) | Not yet drafted |
| Inventory monitoring dashboard | 16-reporting-and-analytics | Not yet drafted |
| Low-stock notifications | 14-notifications-and-alerts | Not yet drafted |
| Inventory movement history | 16-reporting-and-analytics (queries the `stock_entries` ledger from 01) | Not yet drafted |
| Analytics & reporting | 16-reporting-and-analytics | Not yet drafted |
| Dashboard optimization | Cross-cutting perf, 04/05 | — |
| System integration testing | testing.md | — |
| Milestone 3 Review & Launch | Sign-off gate | — |

## Milestone 4 — Final Handover & Deployment (Weeks 7–8)

| # | Gantt task | Schedule | Overall % | Mapped spec(s) | Spec Status | Implementation Status |
|---|---|---|---|---|---|---|
| 4.1 | Full system integration | — | 0% | Cross-cutting | **Not Started** | Not Started |
| 4.2 | End-to-end testing | — | 0% | Governed by `testing.md` | **Process Approved** | Not Started |
| 4.3 | Bug fixing & optimization | — | 0% | Cross-cutting | **Not Started** | Not Started |
| 4.4 | User Acceptance Testing (UAT) | — | 0% | `20-documentation-training-and-uat`| **Spec Drafted** | Not Started |
| 4.5 | Documentation preparation | — | 0% | `20-documentation-training-and-uat`| **Spec Drafted** | Not Started |
| 4.6 | User manual completion | — | 0% | `20-documentation-training-and-uat`| **Spec Drafted** | Not Started |
| 4.7 | Administrator training | — | 0% | `20-documentation-training-and-uat`| **Spec Drafted** | Not Started |
| 4.8 | Production deployment | — | 0% | `04-services-and-infrastructure` | **Spec Drafted** | Not Started |
| 4.9 | Final client validation | — | 0% | Project closure | **Not Started** | Not Started |
| 4.10 | Final Handover | — | 0% | Sign-off gate | **Not Started** | Not Started |

---

## Standing Rule
Every time a new spec is drafted or changes status, check this table for rows that reference it and update the status column. This table is only useful if it stays current — treat a stale row here as a bug the same way an undocumented design token is a bug (per `brand-design-system.md` §13's governance principle).
