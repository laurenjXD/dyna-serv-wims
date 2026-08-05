# Documentation, Training, and UAT — Design

Status: Draft

Cites foundational specs:

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

## 1. Overview & Architecture

Spec 20 defines the operational enablement architecture, UAT test execution structures, documentation formats, and training workflows.

The documentation and UAT design follows three core pillars:
1. **In-App & Contextual Documentation:** Help widgets, keyboard shortcut legends, and high-contrast mobile guides embedded directly within the Next.js UI shell (`specs/05-ui-shell-and-navigation/`).
2. **Dedicated UAT Sandbox Pipeline:** Isolated Supabase environment seeded with reproducible synthetic data (`supabase/seed_uat.sql`) and hardware barcode testing profiles.
3. **Structured Training Curriculum:** Practical, scenario-based training tracks for floor warehousemen (mobile handheld priority) and office staff (desktop admin dashboard).

---

## 2. UAT Design & Test Suite Architecture

### 2.1 Sandbox Environment Setup
The UAT environment mirrors production configurations but uses isolated database instances, staging storage buckets, and synthetic data:

```
[Staging Supabase Instance] 
  ├── Database: Seeded with realistic warehouse layout (Zones A-D, Racks 01-10)
  ├── Auth: Pre-configured test accounts for each RBAC role
  ├── Storage: Test bucket for sample CIPL/WRR PDF documents
  └── Hardware Simulation: Virtual barcode generator & network disconnect toggle
```

### 2.2 UAT Test Scenario Matrix

| Scenario ID | Primary Workflow | Target Role | Key Validation Points | Pass Criteria |
|---|---|---|---|---|
| `UAT-01` | VMI Receiving & Inspection | Warehouseman | Scan CIPL barcode -> Verify WRR -> Flag damaged items -> Assign bin location | WRR generated, stock added with VMI party ownership, location ledger updated |
| `UAT-02` | Two-Stage Outgoing Withdrawal | Warehouseman & Office Admin | Office generates `pick_list` -> Floor scans items -> Pack -> Generate `acknowledgement_receipt` | Final priced `pick_list` and `acknowledgement_receipt` created; inventory deducted |
| `UAT-03` | Offline Sync Recovery | Warehouseman | Switch handheld to offline mode -> Scan 5 receiving items -> Reconnect Wi-Fi | Tier 1 offline queue flushes automatically; no duplicate entries created |
| `UAT-04` | VMI Period Billing Calculation | Office Admin | Run end-of-period VMI billing sweep for Client A | Period CBM space average calculated correctly; statement generated |
| `UAT-05` | Trading Order Pricing & Fulfillment | Office Admin | Create Trading order -> Lock unit price -> Execute pick list | Document price locked on `pick_list`; no unpriced status allowed |
| `UAT-06` | Approval Queue Escalation | Office Admin / Manager | Submit stock adjustment > 100 units -> Review in Approval Queue -> Approve | Stock update executed only after formal sign-off in queue |

---

## 3. Documentation Design & Templates

### 3.1 Mobile Floor Operator Quick Reference (Handheld Focus)
Per `brand-design-system.md`, floor guides follow strict visual hierarchy:
- High contrast typography (sans-serif, minimum 16px text).
- Single primary action button per screen (`48px` minimum touch target).
- Explicit visual status badges:
  - `[ONLINE]` (Green) / `[OFFLINE]` (Amber)
  - `[SYNCING]` (Blue pulse animation)
- Step-by-step visual workflow diagrams for barcode scanning hygiene (holding distance, QR vs 1D barcode alignment).

### 3.2 System Administrator Runbook Layout
```markdown
# Administrator Operational Runbook — Hyperion 3PL / Dyna-Serv

## 1. Daily Health Checklist
- Check Sentry error dashboard for unresolved runtime exceptions.
- Verify Supabase Edge Function cron execution logs for VMI billing sweeps.
- Audit failed offline sync queue entries.

## 2. User Onboarding & Role Assignment
1. Navigate to Office Admin -> User Management.
2. Invite user via email address.
3. Assign RBAC Role (`Warehouseman`, `OfficeAdmin`, `PartyClient`, `SysAdmin`).
4. Verify RLS policy propagation.

## 3. Emergency & Incident Response
- Database Backup Restoration procedure.
- Wi-Fi Access Point failover protocol for warehouse floor handhelds.
- Secret Rotation runbook (Supabase service keys, Resend API tokens).
```

---

## 4. Training Program Design

### 4.1 Track A: Warehouse Floor Operators (Handheld Priority)
- **Duration:** 2 Sessions (2 Hours each).
- **Equipment:** Handheld Android barcode scanners, thermal printer, test pallets.
- **Modules:**
  1. Handheld Device Overview & Touch UI Navigation.
  2. Incoming Receiving & Location Scan placement (`parties`/`items`/`locations`).
  3. Picking Execution from `pick_list` & Packing Verification.
  4. Handling Offline Disconnects (understanding offline queue indicator & retry behavior).

### 4.2 Track B: Office Managers & Finance Staff
- **Duration:** 2 Sessions (2 Hours each).
- **Equipment:** Desktop workstations.
- **Modules:**
  1. Desktop Navigation & Dashboard Overview.
  2. Managing the Two-Stage Approval Queue (`09-approval-queue`).
  3. VMI Period Billing Calculation & Statement Audit (`12-vmi-billing`).
  4. Trading Buy/Sell Pricing & Margin Controls (`13-trading-orders-and-pricing`).

---

## 5. UAT Sign-Off & Handover Artifact

The final UAT sign-off document template (`specs/20-documentation-training-and-uat/uat_signoff_template.md`) requires explicit signatures before production promotion:

```markdown
# UAT Sign-Off & Production Promotion Gate

Date: YYYY-MM-DD
Environment: Staging / UAT Sandbox

## Summary of Results
- Total Test Cases Executed: [ Count ]
- Passed: [ Count ]
- Failed: 0 (Open Severities 1 & 2: 0)

## Sign-Off Signatures

_______________________________________
Warehouse Operations Lead (Signature / Date)

_______________________________________
Finance & Office Lead (Signature / Date)

_______________________________________
Lead Technical Architect (Signature / Date)
```
