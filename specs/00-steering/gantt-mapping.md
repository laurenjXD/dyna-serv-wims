# Gantt-to-Spec Mapping — Delivery Tracking Layer
Status: Active
Last Updated: 2026-08-05

This sits above the spec folders, not inside them. Because we follow **Spec-Driven Development** (no implementation code is written until `tasks.md` is Approved), the traditional Gantt chart tasks are split to reflect our actual flow. 

The current Gantt timeline tracks the **Spec Definition Phase** (Drafting Requirements $\rightarrow$ Design $\rightarrow$ Tasks $\rightarrow$ Approval) before unlocking the **Implementation Phase**. The progress percentages below currently reflect progress in *Spec Drafting*, not coding.

---

## Milestone 1 — Receiving & Core Inventory Transfers

| # | Gantt task | Schedule | Overall % | Mapped spec(s) | Spec Status (Drafting / Approved) | Implementation Status |
|---|---|---|---|---|---|---|
| 1.1 | Repository and development environment setup | 7/31 – 8/5 | 70% | Pre-spec scaffolding | **Paused** (Awaiting Spec 01) | Not Started |
| 1.2 | Core inventory data model and database schema | 7/31 – 8/5 | 80% | `01-core-data-model` | **Spec Approved** | Ready for Dev |
| 1.3 | Warehouse user authentication and RBAC | 7/31 – 8/5 | 30% | `02-rbac-roles`, `21-user-profile-and-settings` | **Spec Approved** | Ready for Dev |
| 1.4 | Receiving and inspection interface | 7/31 – 8/5 | 0% | `07-incoming-receiving`, `05-ui-shell` | **Pending** (Input notes only) | Not Started (Blocked by Spec) |
| 1.5 | Receiving transaction and lot creation logic | 7/31 – 8/5 | 0% | `07-incoming-receiving` | **Pending** (Input notes only) | Not Started (Blocked by Spec) |
| 1.6 | Internal inventory transfer requests | 8/6 – 8/11 | 0% | `11-transfer-and-inspection` | **Not Started** | Not Started (Blocked by Spec) |
| 1.7 | Transfer approval and authorization workflow | 8/6 – 8/11 | 0% | `09-approval-queue` | **Not Started** | Not Started (Blocked by Spec) |
| 1.8 | Receiving, transfer, quantity, and location validation | 8/6 – 8/11 | 0% | Part of `07` & `11` | **Not Started** | Not Started (Blocked by Spec) |
| 1.9 | Receiving and transfer unit/integration testing | 8/6 – 8/11 | 0% | `testing.md` | **Process Approved** | Not Started (Awaiting code) |
| 1.10 | Milestone 1 inventory review and launch | — | 0% | Sign-off gate | **Not Started** | Not Started |

---

## Milestone 2 — Classification & Inventory Processing

| # | Gantt task | Mapped spec(s) | Spec Status | Implementation Status |
|---|---|---|---|---|
| 2.1 | Item category and subcategory management | `17-product-categorization-and-classification` | **Not Started** | Not Started |
| 2.2 | Item classification and flow validation | `17-product-categorization-and-classification` | **Not Started** | Not Started |
| 2.3 | Barcode and QR item identification | `18-barcode-integration` | **Spec Drafted** | Not Started |
| 2.4 | FIFO/FEFO pick-list generation | `10-pick-list-and-acknowledgement-receipt` | **Not Started** | Not Started |
| 2.5 | Inventory picking and quantity verification | `08-outgoing-withdrawal-and-two-stage-commitment` | **Not Started** | Not Started |
| 2.6 | Receiving-to-picking inventory process integration | Cross-cutting | **Not Started** | Not Started |
| 2.7 | Classification and picking testing/fixes | `testing.md` | **Process Approved** | Not Started |
| 2.8 | Milestone 2 inventory processing review and launch | Sign-off gate | **Not Started** | Not Started |

---

## Milestone 3 — Inventory Control & Analytics

| # | Gantt task | Mapped spec(s) | Spec Status | Implementation Status |
|---|---|---|---|---|
| 3.1 | Master inventory monitoring dashboard | `16-reporting-and-analytics` | **Spec Drafted** | Not Started |
| 3.2 | Reorder-level and low-stock alerts | `14-notifications-and-alerts` | **Not Started** | Not Started |
| 3.3 | Immutable inventory movement history | `16-reporting-and-analytics` | **Spec Drafted** | Not Started |
| 3.4 | Inventory valuation and stock reports | `16-reporting-and-analytics` | **Spec Drafted** | Not Started |
| 3.5 | Inventory analytics and trend dashboard | `16-reporting-and-analytics` | **Spec Drafted** | Not Started |
| 3.6 | VMI CBM storage billing calculations | `12-vmi-billing` | **Spec Drafted** | Not Started |
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
| 4.4 | Inventory workflow user acceptance testing | `20-documentation-training-and-uat` | **Spec Drafted** | Not Started |
| 4.5 | Technical inventory system documentation | `20-documentation-training-and-uat` | **Spec Drafted** | Not Started |
| 4.6 | Inventory user manual completion | `20-documentation-training-and-uat` | **Spec Drafted** | Not Started |
| 4.7 | Administrator inventory system training | `20-documentation-training-and-uat` | **Spec Drafted** | Not Started |
| 4.8 | Production deployment of the inventory system | `04-services-and-infrastructure` | **Spec Drafted** | Not Started |
| 4.9 | Final client inventory validation | Project closure | **Not Started** | Not Started |
| 4.10 | Final inventory system handover and acceptance | Sign-off gate | **Not Started** | Not Started |

---

## Standing Rule
Every time a new spec is drafted or changes status, check this table for rows that reference it and update the status column. This table is only useful if it stays current — treat a stale row here as a bug the same way an undocumented design token is a bug (per `brand-design-system.md` §13's governance principle).
