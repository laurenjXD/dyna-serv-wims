# Documentation, Training, and UAT — Tasks

Status: Approved
Updated: 2026-08-05

Sign-off:
- [x] Technical Lead Sign-off
- [x] Product/Operations Lead Sign-off

---

## Task Checklist

### 1. UAT Environment & Test Suite Setup
- [ ] **Task 20.1: Build UAT Synthetic Seed Script**
  - Create `supabase/seed_uat.sql` with realistic layout (`locations`), item master (`items`), party records (`parties`), and initial stock balance.
  - Verify seed data loads cleanly into staging environment.
- [ ] **Task 20.2: Author UAT Test Case Suite**
  - Draft scenario scripts for UAT-01 through UAT-15 as defined in `design.md` §2.2 (P1 scenarios first, then P2, then P3).
  - Each script must include precondition, step-by-step actions, expected outcome, pass/fail criteria, and evidence attachment slot (screen recording or screenshot set).
  - Review test case suite with Warehouse Operations Lead and Finance Lead.

### 2. User Documentation & Manuals
- [ ] **Task 20.3: Author Mobile Floor Operator Quick Reference Guide**
  - Draft visual, high-contrast guide for handheld barcode scanner users.
  - Document receiving, picking, packing, transfer, and offline sync notifications.
- [ ] **Task 20.4: Author Desktop Office Manager Manual**
  - Document approval queue management, stock adjustment overrides, VMI period billing, and Trading pricing.
- [ ] **Task 20.5: Author Technical System & Runbook Documentation**
  - Document system architecture, database schema dictionary, user onboarding runbook, and emergency incident response protocols.

### 3. Staff & Admin Training Program
- [ ] **Task 20.6: Conduct Track A (Warehouse Floor Staff) Training**
  - Conduct hands-on barcode scanner receiving, picking, and offline recovery training in UAT environment.
  - Administer practical competency evaluation for floor staff.
- [ ] **Task 20.7: Conduct Track B (Office Staff) Training**
  - Conduct desktop navigation, approval queue processing, VMI billing, and Trading pricing training.
  - Administer practical competency evaluation for office staff.

### 4. UAT Execution & Formal Handover Gate
- [ ] **Task 20.8: Execute UAT Scenarios & Log Defect Remediation**
  - Run full UAT suite with end-users in staging environment.
  - Track and remediate all identified defects (ensure 0 open Severity 1 / Severity 2 bugs).
- [ ] **Task 20.9: Obtain Formal UAT Sign-Off & Launch Approval**
  - Complete `uat_signoff_template.md` with required signatures from Warehouse Operations Lead, Finance Lead, and Technical Lead.
