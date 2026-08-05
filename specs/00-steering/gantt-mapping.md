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

| # | Gantt task | Schedule | Overall % | Mapped spec(s) | Spec Status | Implementation Status |
|---|---|---|---|---|---|---|
| 2.1 | Product category management | — | 0% | `17-product-categorization...` | **Not Started** | Not Started |
| 2.2 | Inventory classification logic | — | 0% | `17-product-categorization...` | **Not Started** | Not Started |
| 2.3 | Barcode/QR integration | — | 0% | Cross-cutting (`01`, `07`, `18`) | **Not Started** | Not Started |
| 2.4 | Picking list generation | — | 0% | `10-pick-list-and-acknowledgement...`| **Not Started** | Not Started |
| 2.5 | Picking workflow | — | 0% | `08-outgoing-withdrawal...` | **Not Started** | Not Started |
| 2.6 | Packing module UI | — | 0% | `18-packing` | **Not Started** | Not Started |
| 2.7 | Packing confirmation workflow | — | 0% | `18-packing` | **Not Started** | Not Started |
| 2.8 | Logistics process integration | — | 0% | Cross-cutting | **Not Started** | Not Started |
| 2.9 | Testing & bug fixes | — | 0% | Governed by `testing.md` | **Process Approved** | Not Started |
| 2.10 | Milestone 2 Review & Launch | — | 0% | Sign-off gate | **Not Started** | Not Started |

---

## Milestone 3 — Fulfillment Control & Analytics (Weeks 5–6)

| # | Gantt task | Schedule | Overall % | Mapped spec(s) | Spec Status | Implementation Status |
|---|---|---|---|---|---|---|
| 3.1 | Dispatch scheduling module | — | 0% | `19-dispatch-scheduling...` | **Not Started** | Not Started |
| 3.2 | Dispatch approval workflow | — | 0% | `09-approval-queue`, `19` | **Not Started** | Not Started |
| 3.3 | Delivery status tracking | — | 0% | `19-dispatch-scheduling...` | **Not Started** | Not Started |
| 3.4 | Inventory monitoring dashboard | — | 0% | `16-reporting-and-analytics` | **Spec Drafted** | Not Started |
| 3.5 | Low-stock notifications | — | 0% | `14-notifications-and-alerts` | **Not Started** | Not Started |
| 3.6 | Inventory movement history | — | 0% | `16-reporting-and-analytics` | **Spec Drafted** | Not Started |
| 3.7 | Analytics & reporting | — | 0% | `16-reporting-and-analytics` | **Spec Drafted** | Not Started |
| 3.8 | Dashboard optimization | — | 0% | Cross-cutting (`04`, `05`) | **Not Started** | Not Started |
| 3.9 | System integration testing | — | 0% | Governed by `testing.md` | **Process Approved** | Not Started |
| 3.10 | Milestone 3 Review & Launch | — | 0% | Sign-off gate | **Not Started** | Not Started |

---

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
