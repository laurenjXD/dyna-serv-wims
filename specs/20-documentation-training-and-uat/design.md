# Documentation, Training, and UAT — Design

Status: Approved
Updated: 2026-08-05

Cites foundational specs:

- `specs/00-steering/product.md`
- `specs/00-steering/tech.md`
- `specs/00-steering/structure.md`
- `specs/00-steering/ui-ux-design-plan.md`
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

The table below supersedes the earlier six-scenario draft. Scenarios are grouped by flow and assigned a UAT priority (P1 = blocking/go-no-go; P2 = major/must-fix; P3 = minor/acceptable-with-workaround). Each scenario requires a screen recording or complete screenshot set as evidence before sign-off.

| Scenario ID | Scenario | Flow | Target Role | Key Validation Points | Priority | Pass Criteria |
|---|---|---|---|---|---|---|
| `UAT-01` | Standard receiving: store disposition | Receiving | Warehouseman | Scan CIPL barcode → WRR confirmation → `store` disposition → putaway to bin | P1 | WRR confirmed; lot created with `available` status; `lot_location_balances` row inserted; `inventory_transaction` (`receiving`) recorded |
| `UAT-02` | Receiving with inbound inspection: pass → available | Receiving | Warehouseman, Supervisor | `inspect/on_hold` disposition → conformance outcome → available | P1 | Conformance recorded in `wrr_inspection_logs`; lot transitions to `available`; `lot_location_balances` created |
| `UAT-03` | Receiving with inbound inspection: fail → hold | Receiving | Warehouseman, Supervisor | `inspect/on_hold` disposition → non-conformance outcome → quarantine | P1 | Non-conformance logged with reason and evidence; inventory balance NOT incremented; lot held |
| `UAT-04` | Standard FIFO pick-list generation and dispatch | Outbound | Warehouseman, Supervisor | Generate pick list from Master Inventory → FIFO/FEFO allocation → floor scan → `dispatch` disposition | P1 | Pick list generated with FIFO-ordered lots; commitment created; dispatch completes with `inventory_transaction` (`pick`) and `acknowledgement_receipt` generated |
| `UAT-05` | FIFO override request and approval | Outbound | Warehouseman, Supervisor | Non-standard allocation request → override submitted to `09` → supervisor approves → pick list generated | P1 | Override request logged; supervisor approves (self-approval blocked); pick list uses approved non-FIFO allocation |
| `UAT-06` | FIFO override denied/expired | Outbound | Warehouseman, Supervisor | Override submitted → supervisor denies or request window expires | P1 | Pick list not generated; commitment not created; denial/expiry recorded in approval queue |
| `UAT-07` | Outbound further inspection: pass → dispatch | Outbound | Warehouseman, Supervisor | Post-pick `further_inspection` disposition → inspection pass → dispatch | P1 | Commitment stays `inspection_pending` during inspection; transitions to `executed` on dispatch; `acknowledgement_receipt` generated |
| `UAT-08` | Outbound further inspection: fail → commitment cancelled | Outbound | Warehouseman, Supervisor | Post-pick `further_inspection` disposition → inspection fail → commitment cancelled | P1 | Commitment cancelled; `qty_committed` released back to `qty_remaining`; failed inspection logged with evidence |
| `UAT-09` | Offline scan capture and sync | Offline | Warehouseman | Switch handheld to offline mode → scan 5 receiving items → reconnect Wi-Fi | P2 | Tier 1 offline queue flushes automatically on reconnect; no duplicate entries; server re-validates each queued operation |
| `UAT-10` | Document reprint (pick list and acknowledgement receipt) | Documents | Warehouseman, Supervisor | Reprint a previously generated pick list and acknowledgement receipt | P2 | Correct version reprinted; no pricing or content mutation on reprint |
| `UAT-11` | Unknown item during receiving → enrollment → resume | Receiving | Warehouseman, Supervisor | Unknown SKU scanned on floor → enrollment form triggered via `06` → item enrolled → receiving resumes | P2 | New item enrolled; `wrr_items.item_id` resolved; receiving confirmation completes successfully |
| `UAT-12` | Concurrent commitment attempt (two users, same lot) | Outbound | Warehouseman (×2) | Two users simultaneously attempt to commit the same lot/location quantity | P2 | Exactly one commitment succeeds; the second receives a safe conflict response; no double-allocation |
| `UAT-13` | Low stock alert triggered and acknowledged | Notifications | Supervisor, Warehouseman | Stock falls below `min_reorder_level` → alert appears in notification feed → acknowledged | P2 | Low-stock notification delivered via `14`; acknowledged state recorded; no workflow mutation triggered |
| `UAT-14` | VMI billing statement generated and exported | Billing | Office Admin | Run end-of-period VMI billing sweep → statement generated → exported | P3 | Period CBM space average calculated correctly; statement generated and downloadable |
| `UAT-15` | Trading order priced, dispatched, receipt generated | Trading | Office Admin, Warehouseman | Create Trading order → lock unit price → execute pick list → generate receipt | P3 | Document price locked on `pick_list`; `acknowledgement_receipt` generated with correct priced snapshot |

---

## 3. Documentation Design & Templates

### 3.1 Mobile Floor Operator Quick Reference (Handheld Focus)
Per `ui-ux-design-plan.md`, floor guides follow strict visual hierarchy:
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
