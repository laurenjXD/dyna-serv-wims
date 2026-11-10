# Product Owner Revision Notes & Implementation Plan

**Status:** Working plan — Product Owner input captured; formal feature amendments and sign-offs pending  
**Captured:** 2026-11-10  
**Scope:** Dashboard, CIPL mapping, receiving/SPQ, RBAC visibility, pick-list labels, session timeout, approvals, dispatch, and Settings customization

This document normalizes the Product Owner's latest notes into implementation
work. It is a planning document, not an approval record. It does not authorize
application code, migrations, or infrastructure changes. The repository rule
still applies: the owning feature's `requirements.md`, `design.md`, and
`tasks.md` must all be approved with both sign-offs before implementation.

## 1. Current-contract reconciliation

Some notes are already covered by approved decisions and therefore become
verification work rather than new scope:

| Note | Current contract | Plan treatment |
|---|---|---|
| Administrator can view what other roles see | `02-rbac-roles` already grants Administrator the required operational visibility and capability parity. Interactive administrator actions remain RLS-checked and attributable. | Add a read-only effective-access/role preview if the Product Owner means “view the role experience.” Do not add user impersonation or a service-role bypass; impersonation is explicitly out of scope for v1. |
| Dispatch scans per box, not per line | The 2026-11-04 `08` amendment requires every assigned carton/box QR to be scanned once; a line completes only after all assigned cartons are confirmed. | Verify code, copy, and tests against the per-carton contract. Remove only stale line-level behavior or assertions. No new dispatch model is needed unless “box” means a different physical identity than `inventory_units`. |
| Quick enrollment when an item is absent | `06`/`07` already require controlled online enrollment and resumption of the held WRR line. | Add a contextual shortcut that opens the existing enrollment contract with prefilled source values, then returns to the preserved CIPL/WRR draft. No inline bypass, offline enrollment, or floor-staff privilege escalation. |

## 2. Revised requirements to formalize

### 2.1 Dashboard requirement

The note “Req dashboard” does not identify a concrete dashboard behavior yet.
Before implementation, record the required widget, source data, audience,
role/capability visibility, action, and empty/unavailable state. The dashboard
must not gain invented metrics or a new workflow merely from this shorthand.

The discovery output must answer:

- Which dashboard is affected: `/`, Master Inventory, Receiving, or another
  route?
- What does “Req” mean in the desired label or workflow?
- Which roles see it, and is it read-only or actionable?
- What authoritative query supplies the data?
- What should appear for zero, unavailable, stale, and forbidden states?

The answer belongs in the owning feature specification before dashboard code is
changed.

### 2.2 CIPL mapping and source-field visibility

The current `07` contract treats the CIPL file as an external reference and
does not define a full machine-mapping review. The requested behavior is a
scope amendment spanning `07-incoming-receiving`, `06-party-and-item-enrollment`,
and `04-services-and-infrastructure`:

1. The mapping review SHALL show every source column and every source row that
   was read, including sample values, source position, inferred type, and
   mapping status.
2. Mapping status SHALL distinguish `mapped`, `unmapped`, `ignored by user`,
   `missing required target`, `ambiguous`, and `invalid value`. Unmapped data
   must remain visible in the review; it must never disappear because the
   parser could not assign a target.
3. The target-field list SHALL use canonical names and labels, including
   Supplier Item Code, Customer Part Number, Description, UOM, SPQ, quantity,
   lot/reference fields, and remarks. The UI may use friendly labels, but the
   persisted contract remains `supplier_item_code`, `customer_item_code`, and
   the approved WRR fields.
4. Suggested mappings MAY use normalized header aliases and sample-value
   inspection, but suggestions are not authoritative. The operator must be
   able to confirm, change, exclude, or leave a source field unmapped.
5. Required target fields, unresolved item identity, invalid quantity/UOM/SPQ,
   and ambiguous organization references SHALL block staging or commit with
   the shared What / Why / Next Action state contract.
6. The review SHALL preserve the original source document and the confirmed
   mapping/audit snapshot so a later operator can understand how each WRR line
   was produced.

#### No existing item code

An unmatched source code SHALL create an explicit unresolved/provisional row,
not a fake item and not a silently blank line. The operator can choose
**Enroll Material** from the mapping or WRR review. That action:

- opens the standard `06` Material enrollment flow with safe source values
  prefilled;
- requires the normal `items.manage` authorization and complete validation;
- keeps the current mapping/WRR draft intact while enrollment is in progress;
- returns the newly enrolled item to the review and re-runs server-side
  identity/SPQ validation; and
- remains online-only and unavailable to an offline floor scan.

The unresolved line remains held until the enrollment is confirmed. It cannot
be received, committed, allocated, or dispatched while its authoritative item
identity is missing.

### 2.3 Receiving SPQ variability

The current master-data contract has one enrolled `items.spq`, while the
Product Owner reports test and receiving cases where the same part number can
arrive with different SPQ values. The implementation must not overwrite the
master SPQ from one shipment.

Before code, `06`, `07`, `01`, and `08` must choose and approve one of these
contracts:

- **Line packaging snapshot (recommended):** retain the enrolled SPQ as the
  default, but record a validated shipment/WRR-line SPQ when the source
  shipment explicitly declares a different packaging configuration. Labels,
  carton derivation, and receiving reconciliation use the line snapshot; the
  master item remains unchanged.
- **Separate material identity:** enroll separate item records when the
  packaging difference represents a materially different item identity.

The decision must define how the effective SPQ flows into carton labels,
`inventory_units`, lot/location balances, pick-list package counts, and future
FIFO/FEFO allocation. A test fixture must cover one item with two receiving
lines using different SPQ values and prove there is no cross-line leakage.

### 2.4 RBAC role visibility

Add a read-only Administrator view of the effective capability matrix and role
experience where needed:

- show what each built-in or custom role can read, execute, approve, or manage;
- show scope restrictions and the difference between a role grant and a
  user's effective multi-role grant;
- never expose another user's session, secrets, or party-scoped data merely to
  preview a role;
- never make preview equal to impersonation; and
- keep all actual data reads and mutations under the current administrator's
  session, capabilities, and RLS.

The owning amendment belongs to `02-rbac-roles` and the presentation surface
belongs to `21-user-profile-and-settings`.

### 2.5 Pick-list labels and field meaning

For pick-list review, print, and acknowledgement-receipt views, use the
following user-facing mapping unless the Product Owner later defines a
different document-specific label:

| User-facing label | Canonical value |
|---|---|
| **Item Code** | Supplier item code (`supplier_item_code`) |
| **Cust. Part Number** | Enrolled customer item code (`customer_item_code`) |
| **Dyna-Serv Code** | Internal `items.code`, shown only where operationally necessary |

This is a label/data-source correction, not a database-column rename. `06`,
`07`, `08`, and `10` must reconcile the snapshot fields and document templates
so the same meanings appear in CIPL mapping, receiving, Master Inventory,
pick-list review, print, and receipt output.

### 2.6 Session timeout and “Stay signed in”

The request is interpreted as a bounded session-persistence option, not an
indefinite token. The proposed contract is:

- add a clearly explained **Stay signed in** option at sign-in if the current
  authentication surface does not already expose one;
- keep the approved server/session maximum and revocation behavior from `04`;
- allow refresh within that maximum, subject to account deactivation,
  administrator policy, and explicit sign-out;
- preserve idle-timeout warnings and provide a safe “Continue session” action;
- default shared/floor devices to the safer non-persistent behavior unless the
  Product Owner explicitly chooses otherwise; and
- never let a client checkbox bypass Auth expiry, revoked sessions, or the
  configured security policy.

`04`, `05`, `21`, and the authentication UI must agree on the exact duration,
shared-device default, refresh behavior, and copy before implementation.

### 2.7 Approval absence and supervisor email notice

The approval page must represent missing or unavailable approvers explicitly:

- a durable pending request remains visible to authorized reviewers;
- if no eligible active approver exists, show a blocking attention state to the
  requester and Administrator with the next action to assign/activate an
  approver;
- never auto-approve, silently drop, or mark a request complete because the
  reviewer is absent;
- unknown, deleted, or out-of-scope request IDs use the safe not-found/forbidden
  contract without leaking approval existence; and
- a pending FIFO override sends an idempotent email notice to eligible active
  supervisors/administrators, with in-app/realtime/manual-refresh fallback.

Email delivery is a signal only. Approval state remains authoritative in the
queue, and delivery failure creates retry/attention state without rolling back
the request.

### 2.8 Settings customization

Add an Administrator-only **Workspace Customization** section under Settings.
The first release should use an allowlisted configuration model, not arbitrary
HTML or unrestricted database-driven UI:

- editable application/page titles and approved navigation labels;
- optional organization display name/logo presentation where the existing
  branding contract permits it;
- preview, save, reset-to-default, and audit history;
- effective settings applied consistently to the shell, dashboard, receiving,
  inventory, pick-list, approval, outgoing, and document-title surfaces; and
- clear fallback to canonical defaults when a value is missing, invalid, or
  unavailable.

Customization SHALL NOT change permissions, workflow state names, database
identifiers, legal/financial document facts, barcode values, canonical audit
events, or the shared success/error/loading/offline wording. User-facing
messages remain governed by `error-message-writing-guide.md`.

The storage shape should extend the existing `system_settings` contract with a
versioned `customization` namespace, subject to `21`/`04` persistence and
audit review. No new `warehouse_id` or parallel customization table is
assumed.

## 3. Implementation sequence

### Phase 0 — Confirm ambiguous decisions and amend specs

1. Record the missing Dashboard requirement.
2. Resolve line-level SPQ versus separate-material identity with a concrete
   receiving example.
3. Confirm the exact “Stay signed in” maximum and shared-device default.
4. Confirm the list of customizable titles/labels and whether branding is
   included.
5. Amend the owning `requirements.md`, `design.md`, and `tasks.md` files in
   dependency order, then obtain both required sign-offs.

### Phase 1 — CIPL mapping and receiving

Owners: `07`, `06`, with `04` storage/artifact support and `01` only if the
approved SPQ decision changes persistence.

- define source-column/row metadata and mapping-state types;
- build the all-fields mapping review and non-silent unmapped-row path;
- add safe prefilled Material enrollment handoff and draft restoration;
- implement the approved SPQ contract and receiving reconciliation;
- cover unknown item, ambiguous mapping, missing field, invalid SPQ,
  under-scan, over-scan, and offline states.

### Phase 2 — RBAC, session, and approval operations

Owners: `02`, `04`, `09`, `14`, `21`, and `05` for shell/session presentation.

- add read-only role/effective-access visibility without impersonation;
- implement the bounded Stay signed in and idle-timeout contract;
- add the no-approver state and eligible-reviewer resolution path;
- add durable, idempotent supervisor/admin approval email notices;
- verify RLS, revocation, notification fallback, and audit attribution.

### Phase 3 — Pick-list terminology and dispatch verification

Owners: `08` and `10`, with `07`/`06` source-field reconciliation.

- align labels and snapshots to Supplier Item Code / Cust. Part Number;
- preserve internal Dyna-Serv code only where explicitly labeled and needed;
- verify every assigned carton/box can be scanned once and only once;
- reject wrong, duplicate, stale, unassigned, or cross-line scans;
- update print, receipt, review, and source-string/component tests.

### Phase 4 — Workspace customization and dashboard delivery

Owners: `21`, `05`, and the owning dashboard feature after Phase 0 defines it.

- extend the approved settings contract with versioned customization values;
- build allowlisted editor, preview, save, reset, audit, and fallback states;
- apply effective labels through the shell and approved feature surfaces;
- verify that customization cannot alter authorization, business semantics, or
  canonical system feedback;
- implement only the dashboard requirement that was explicitly approved.

### Phase 5 — Release verification

- typecheck, lint, unit/component tests, real-Postgres/RLS tests where schema
  or authorization changed, production build, and targeted Playwright;
- CIPL mapping fixtures with every source column visible and no dropped data;
- two same-item/different-SPQ receiving fixtures if the line-snapshot option is
  approved;
- role matrix for Administrator, Supervisor, warehouse staff, and party user;
- session expiry, refresh, revocation, shared-device, and offline checks;
- approval with eligible reviewer, no reviewer, email success, email failure,
  stale request, and forbidden/not-found cases;
- per-box dispatch scan at 375px/430px floor widths;
- settings customization persistence, reset, fallback, audit, and RLS checks.

## 4. Definition of complete

This revision is complete only when:

- every requested behavior has an approved owner and acceptance criteria;
- CIPL mappings show all source data and preserve unresolved fields visibly;
- unknown materials use controlled enrollment and resume safely;
- the approved SPQ contract is enforced without mutating unrelated items;
- Administrator role visibility is read-only, scoped, and non-impersonating;
- pick-list labels match the agreed supplier/customer code meanings;
- session persistence remains bounded and revocable;
- absent approvers and supervisor email delivery have truthful states;
- dispatch verifies each assigned box/carton under the approved contract;
- customization is allowlisted, audited, reversible, and semantically safe; and
- all required verification gates pass with no claim of deployment until hosted
  migration/configuration checks are separately completed.

## 5. Owning specifications and dependencies

| Work item | Primary owner | Supporting specs |
|---|---|---|
| Dashboard requirement | `05` plus the named dashboard owner | `16`, `09`, `07`, `08` as applicable |
| CIPL mapping | `07-incoming-receiving` | `06`, `04`, `01`, `03` |
| Variable SPQ | `06` + `07` | `01`, `08`, `10` |
| Administrator role visibility | `02-rbac-roles` | `21`, `05` |
| Pick-list terminology | `08` + `10` | `06`, `07` |
| Session persistence | `04-services-and-infrastructure` | `05`, `21` |
| Approval absence/email | `09-approval-queue` | `04`, `14`, `02`, `05` |
| Per-box dispatch | `08` | `03`, `10`, `07` |
| Workspace customization | `21-user-profile-and-settings` | `02`, `04`, `05`, `error-message-writing-guide.md` |
