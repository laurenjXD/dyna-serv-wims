# Documentation, Training, and UAT — Requirements

Status: Draft

Depends on:

- `specs/00-steering/product.md`
- `specs/00-steering/tech.md`
- `specs/00-steering/structure.md`
- `specs/00-steering/brand-design-system.md`
- `specs/00-steering/testing.md`
- `specs/01-core-data-model/`
- `specs/02-rbac-roles/`
- `specs/03-offline-mode-and-client-storage/`
- `specs/05-ui-shell-and-navigation/`
- `specs/07-incoming-receiving/`
- `specs/08-outgoing-withdrawal-and-two-stage-commitment/`
- `specs/09-approval-queue/`
- `specs/10-pick-list-and-acknowledgement-receipt/`
- `specs/11-transfer-and-inspection/`
- `specs/12-vmi-billing/`
- `specs/13-trading-orders-and-pricing/`

---

## 1. Overview

This specification governs the final operational readiness phase for Hyperion 3PL / Dyna-Serv. It defines the requirements for system documentation, role-specific user manuals, warehouse floor and office staff training, and User Acceptance Testing (UAT) execution prior to production launch.

The primary target users for training and documentation are:
1. **Warehouse Floor Operators:** Handheld barcode/QR scanner users conducting receiving, putaway, picking, packing, transfer, and inspection.
2. **Office Managers & Administrators:** Desktop users handling two-stage approval queues, VMI CBM period billing, Trading order pricing, inventory audits, and system configuration.
3. **Party / Client Portal Users:** External clients monitoring VMI inventory releases, submitting CIPL notices, and reviewing period billing statements.
4. **System Administrators & DevOps:** Technical operators maintaining infrastructure, managing RBAC roles, monitoring system health, and conducting backups.

---

## 2. Goals

- Provide clear, role-specific user manuals tailored to handheld hardware and desktop administrative interfaces.
- Establish an isolated UAT environment with realistic synthetic seed data for end-to-end operational verification.
- Define structured UAT test cases covering all 3PL inventory flows (VMI, Trading, Supplies) and hardware integration (scanners/printers).
- Conduct hands-on training programs for warehouse floor operators and office personnel.
- Establish technical operational runbooks, API references, and disaster recovery documentation.
- Define formal UAT entry/exit criteria and sign-off procedures required for production promotion.

---

## 3. User Acceptance Testing (UAT) Requirements

### FR-1: UAT Environment & Data Seeding
1. The system SHALL provide a dedicated, isolated UAT environment running on staging infrastructure.
2. The UAT database SHALL be pre-populated with synthetic seed data representing realistic warehouse operations:
   - Physical warehouse layout (zones, aisles, racks, shelves, bins using `locations`).
   - Active parties (VMI clients, Trading suppliers, internal warehouse entity).
   - Item master records with barcode/QR values and classification parameters.
   - Initial stock balances across VMI, Trading, and Supplies ownership models.
3. The UAT environment SHALL simulate real handheld barcode scanners, thermal label printers, and offline network disconnects.

### FR-2: UAT Test Case Coverage
1. The UAT suite SHALL include explicit test scenarios for every primary workflow:
   - **Receiving & Inspection (Spec 07 & 11):** CIPL intake, WRR generation, damage flagging, quarantine location assignment.
   - **Two-Stage Outgoing Withdrawal (Spec 08 & 10):** `pick_list` generation, item picking on handheld scanner, packing, and `acknowledgement_receipt` sign-off.
   - **Approval Queue (Spec 09):** Tier 2 approval workflows for pricing, high-value withdrawals, and stock adjustments.
   - **VMI Billing (Spec 12):** Daily CBM space snapshot aggregation, period average calculation, and statement generation.
   - **Trading Orders & Pricing (Spec 13):** Buy/sell pricing enforcement, document pricing finality on `pick_list` and `acknowledgement_receipt`.
   - **Offline Sync Resilience (Spec 03):** Tier 1 offline queue action recording on floor scanner during Wi-Fi dropouts and background synchronization upon reconnect.
2. Each UAT test case SHALL specify precondition, step-by-step actions, expected outcome, and pass/fail criteria.

### FR-3: Defect Tracking & Resolution SLA
1. All issues identified during UAT SHALL be logged and classified into four severity levels:
   - **Severity 1 (Blocker):** Data corruption, incorrect inventory calculation, security bypass, or workflow failure with no workaround.
   - **Severity 2 (Major):** Core workflow failure with an awkward workaround, or significant UI regression on handheld scanners.
   - **Severity 3 (Minor):** Non-critical UI misalignment, confusing error message, or non-blocking performance lag.
   - **Severity 4 (Cosmetic):** Typo, minor color inconsistency, or non-essential visual tweak.
2. Production promotion SHALL be blocked if any open Severity 1 or Severity 2 defects remain unresolved.

### FR-4: UAT Sign-Off & Handover Gate
1. UAT SHALL be formally concluded with a written Sign-Off Document.
2. Mandatory sign-offs SHALL be required from:
   - **Warehouse Operations Lead** (validating floor scanner efficiency and physical inventory accuracy).
   - **Finance / Office Administrator** (validating VMI period billing, Trading pricing, and approval controls).
   - **Lead Technical Architect** (validating system stability, offline sync integrity, and performance SLAs).

---

## 4. Documentation Requirements

### FR-5: Role-Based User Manuals
1. **Floor Operator Quick Reference (Mobile-First):**
   - SHALL be visual, high-contrast, and optimized for mobile/handheld viewing.
   - SHALL feature step-by-step visual guides for receiving, location scanning, picking execution, and offline sync notifications.
   - SHALL clearly highlight single-primary-action patterns per screen per `brand-design-system.md`.
2. **Office Manager & Administrative Manual:**
   - SHALL cover desktop UI navigation, two-stage approval queues, stock adjustment overrides, and user management.
   - SHALL document the precise formula for VMI CBM period average billing and Trading price locking rules.
3. **Party / Client Portal User Guide:**
   - SHALL instruct external clients on how to submit incoming CIPL notices, track outgoing release requests, and download period billing summaries.

### FR-6: Technical & System Documentation
1. **System Architecture Document:**
   - SHALL document the runtime architecture (Next.js 15 App Router, Supabase Postgres/Auth/Storage/Realtime, Upstash Redis, Sentry).
   - SHALL detail identity propagation, Supabase RLS policies, and Drizzle query patterns.
2. **Database Schema & Data Dictionary:**
   - SHALL detail all core tables (`parties`, `items`, `locations`, `stock_entries`, `pick_list`, `acknowledgement_receipt`), column definitions, foreign keys, indexes, and RLS rules.
3. **System Administrator Runbook:**
   - SHALL provide step-by-step procedures for user onboarding/offboarding, role assignment (`02-rbac-roles`), password resets, and audit log inspection.
   - SHALL document emergency procedures for database backup restoration, secret rotation, and service outage mitigation.

---

## 5. Staff & Administrator Training Requirements

### FR-7: Training Curriculum & Delivery
1. The training program SHALL be divided into distinct tracks:
   - **Track A: Warehouse Floor Operators (2 sessions, hands-on):** Handheld device operation, barcode scanning, location placement, picking validation, packing, and offline mode handling.
   - **Track B: Office Administrators (2 sessions, hands-on):** Desktop dashboard navigation, approval queue processing, VMI period billing run execution, and stock audit reconciliations.
   - **Track C: System Administrators (1 session, technical):** User role assignment, audit logging, monitoring dashboard inspection, and operational runbook review.
2. Training sessions SHALL utilize the dedicated UAT sandbox environment with physical hardware (handheld scanners, thermal label printers).

### FR-8: Competency Verification
1. Each participant in Track A and Track B SHALL complete a practical evaluation scenario before receiving operational access.
2. Floor staff evaluation SHALL verify error-free execution of receiving, location scan, and pick list completion on a mobile scanner within standard time thresholds.
3. Office staff evaluation SHALL verify correct approval processing, VMI billing run generation, and Trading pricing validation.

---

## 6. Out of Scope

- Multi-warehouse training or documentation (system remains strictly single-warehouse).
- Video production or interactive e-learning software platform development in v1.
- Training for unapproved future modules.

---

## 7. Acceptance Criteria

1. UAT test suite covers 100% of primary operational workflows across VMI, Trading, and Supplies models.
2. Zero Severity 1 or Severity 2 defects remain open at the completion of UAT.
3. Formal UAT Sign-Off document is executed by Warehouse Operations Lead, Finance Lead, and Technical Lead.
4. Mobile floor operator quick reference guide and desktop office manager manual are published and accessible within the UI shell.
5. All floor warehousemen and office administrative staff complete training and pass practical competency evaluations.
