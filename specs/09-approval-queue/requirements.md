# Approval Queue — Requirements

Status: Approved
Updated: 2026-08-14 (Aligned with Unified UI/UX & Visual Design System)

## 1. Purpose and scope

The Approval Queue provides a durable, auditable workflow for decisions that must be made by an authorized reviewer before a requesting operation can proceed. It is generic infrastructure for workflow-specific approvals, beginning with FIFO/FEFO override requests from `08-outgoing-withdrawal-and-two-stage-commitment`.

The queue stores request and decision history; it does not own the business mutation that is being approved.

### Terminology Alignment
Across all user-facing approval screens, tables, headers, and UI feedback:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.

*(Note: `parties` and `flow_type` remain canonical database identifiers.)*

## 2. Principles and boundaries

- An approval is a recorded decision, not a boolean field or client flag.
- Approval capability is separate per workflow/resource; a supervisor role does not automatically approve every workflow.
- Self-approval is strictly prohibited (`fifo_override.approve`).
- Approval is online-only and is never authorized from cached/offline state.
- One warehouse only; no `warehouse_id` or tenant simulation.

## 3. Approval type scope — v1

**v1 supports exactly one approval type: `fifo_override`.**
- `fifo_override` — permits `08` to revalidate and commit an out-of-order FIFO/FEFO allocation when an authorized reviewer approves the specific request. 24-hour expiry. Self-approval blocked.

## 4. Actors and surfaces

- **Requester** — submits a workflow-specific approval request with reason and evidence.
- **Reviewer/approver** — views requests within current capability (`fifo_override.approve`) and scope, recording approve/reject decisions.
- **Administrator/auditor** — reviews approval history.
- The queue is an office/supervisor surface (`/approvals`).

## 5. Functional requirements

### R1. Approval request creation & state transitions

1. Authorized workflows submit versioned approval requests (`pending` → `approved` / `rejected` / `expired` / `superseded`).
2. Snapshot includes item, lot, location, requested quantity, reason, requester, and Inventory Model.
3. Requests fail closed offline; no offline queue submission.

### R2. Queue review, filtering & 3-component error feedback

1. Reviewers see requests within their capability and Organization/Inventory Model scope.
2. Filters support category selection, approval type, status, and age.
3. All error states, rejection prompts, and failure boundaries display 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**).
4. Visual design uses Level 0 Cream White (`#FFF7ED`) background, Level 1 Solid White (`#FFFFFF`) cards with `#2563EB` Vibrant Blue accents, and Etna Sans Serif + Glacial Indifference typography.

## 6. Acceptance criteria

- [ ] Requesters can submit FIFO override requests; reviewers can approve or reject.
- [ ] Self-approval is blocked; requesters cannot approve their own requests.
- [ ] User-facing labels use Organization, Inventory Model, and Organization Portal exclusively.
- [ ] 3-component error feedback is present on all error/rejection prompts.
- [ ] Visual design system rules (#2563EB, #0F172A, #64748B, #FFF7ED, #FFFFFF) are fully applied.
