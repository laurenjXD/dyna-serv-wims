# Gantt-to-Spec Mapping — Delivery Tracking Layer
Status: Active
Last Updated: 2026-08-06

This sits above the spec folders, not inside them. Because we follow **Spec-Driven Development** (no implementation code is written until `tasks.md` is Approved), the traditional Gantt chart tasks are split to reflect our actual flow. 

The current Gantt timeline tracks the **Spec Definition Phase** (Drafting Requirements $\rightarrow$ Design $\rightarrow$ Tasks $\rightarrow$ Approval) before unlocking the **Implementation Phase**. The progress percentages below currently reflect progress in *Spec Drafting*, not coding.

---

## Milestone 1 — Receiving & Core Inventory Transfers

| # | Gantt task | Schedule | Overall % | Mapped spec(s) | Spec Status (Drafting / Approved) | Implementation Status |
|---|---|---|---|---|---|---|
| 1.1 | Repository and development environment setup | 7/31 – 8/5 | 70% | Pre-spec scaffolding | **Paused** (Awaiting Spec 01) | Not Started |
| 1.2 | Core inventory data model and database schema | 7/31 – 8/5 | 100% | `01-core-data-model` | **Approved** (both sign-offs complete 2026-08-05) | Ready for Dev |
| 1.3 | Warehouse user authentication and RBAC | 7/31 – 8/5 | 100% | `02-rbac-roles`, `21-user-profile-and-settings` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 1.4 | Receiving and inspection interface | 7/31 – 8/5 | 0% | `07-incoming-receiving`, `05-ui-shell` | **Under Revision** (`05` state/accessibility contract being re-verified; `07` remains Draft) | Not Started (Blocked by Specs 05/07) |
| 1.5 | Receiving transaction and lot creation logic | 7/31 – 8/5 | 0% | `07-incoming-receiving` | **Draft** (all three documents remain Draft) | Not Started (Blocked by Spec) |
| 1.6 | Internal inventory transfer requests | 8/6 – 8/11 | 100% | `11-transfer-and-inspection` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 1.7 | Transfer approval and authorization workflow | 8/6 – 8/11 | 100% | `09-approval-queue` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 1.8 | Receiving, transfer, quantity, and location validation | 8/6 – 8/11 | 0% | Part of `07` & `11` | **Not Started** | Not Started (Blocked by Spec) |
| 1.9 | Receiving and transfer unit/integration testing | 8/6 – 8/11 | 0% | `testing.md` | **Process Approved** | Not Started (Awaiting code) |
| 1.10 | Milestone 1 inventory review and launch | — | 0% | Sign-off gate | **Not Started** | Not Started |

---

## Milestone 2 — Classification & Inventory Processing

| # | Gantt task | Mapped spec(s) | Spec Status | Implementation Status |
|---|---|---|---|---|
| 2.1 | Item category and subcategory management | `17-product-categorization-and-classification` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 2.2 | Item classification and flow validation | `17-product-categorization-and-classification` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 2.3 | Barcode and QR item identification | `18-barcode-integration` | **Draft** (all three documents remain Draft) | Not Started (Blocked by Spec) |
| 2.4 | FIFO/FEFO pick-list generation | `10-pick-list-and-acknowledgement-receipt` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 2.5 | Inventory picking and quantity verification | `08-outgoing-withdrawal-and-two-stage-commitment` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 2.6 | Receiving-to-picking inventory process integration | Cross-cutting | **Not Started** | Not Started |
| 2.7 | Classification and picking testing/fixes | `testing.md` | **Process Approved** | Not Started |
| 2.8 | Milestone 2 inventory processing review and launch | Sign-off gate | **Not Started** | Not Started |

---

## Milestone 3 — Inventory Control & Analytics

| # | Gantt task | Mapped spec(s) | Spec Status | Implementation Status |
|---|---|---|---|---|
| 3.1 | Master inventory monitoring dashboard | `16-reporting-and-analytics` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 3.2 | Reorder-level and low-stock alerts | `14-notifications-and-alerts` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 3.3 | Immutable inventory movement history | `16-reporting-and-analytics` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 3.4 | Inventory valuation and stock reports | `16-reporting-and-analytics` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 3.5 | Inventory analytics and trend dashboard | `16-reporting-and-analytics` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 3.6 | VMI CBM storage billing calculations | `12-vmi-billing` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 3.7 | Inventory dashboard performance optimization | Cross-cutting perf, `04/05` | **Not Started** | Not Started |
| 3.8 | Cross-module inventory integration testing | `testing.md` | **Process Approved** | Not Started |
| 3.9 | Milestone 3 inventory control review and launch | Sign-off gate | **Not Started** | Not Started |

---

## Milestone 4 — Final Handover & Deployment

| # | Gantt task | Mapped spec(s) | Spec Status | Implementation Status |
|---|---|---|---|---|
| 4.1 | Final inventory system integration | Cross-cutting | **Not Started** | Not Started |
| 4.2 | End-to-end inventory workflow testing | `testing.md` | **Process Approved** | Not Started |
| 4.3 | Inventory system bug fixing and optimization | Cross-cutting | **Not Started** | Not Started |
| 4.4 | Inventory workflow user acceptance testing | `20-documentation-training-and-uat` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 4.5 | Technical inventory system documentation | `20-documentation-training-and-uat` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 4.6 | Inventory user manual completion | `20-documentation-training-and-uat` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 4.7 | Administrator inventory system training | `20-documentation-training-and-uat` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 4.8 | Production deployment of the inventory system | `04-services-and-infrastructure` | **Approved** (all three documents and both sign-offs complete 2026-08-06) | Ready for Dev |
| 4.9 | Dispatch scheduling and delivery tracking | `19-dispatch-scheduling-and-delivery-tracking` | **Deferred** (reserved scope; no implementation) | Deferred |
| 4.10 | Final client inventory validation | Project closure | **Not Started** | Not Started |
| 4.11 | Final inventory system handover and acceptance | Sign-off gate | **Not Started** | Not Started |

---

## Standing Rule
Every time a new spec is drafted or changes status, check this table for rows that reference it and update the status column. This table is only useful if it stays current — treat a stale row here as a bug the same way an undocumented design token is a bug (per `brand-design-system.md` §13's governance principle).
