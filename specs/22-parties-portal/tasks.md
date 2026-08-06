# Parties Portal — Implementation Plan

Status: Draft
Updated: 2026-08-06

## Implementation gate

No application code, route, server action, or query may be implemented until:

- `requirements.md` and `design.md` are complete and internally consistent.
- `02-rbac-roles` is Approved (it is — treat its capability catalog and RLS patterns as settled) **and** has completed its own approval/sign-off process (`rbac-rls-reviewer` included) for the `vmi_statements.read` (`assigned_party`) capability now written in `02` design.md §3.2/§7.4 (`design.md` §4/§7) before any VMI-statements task below (Task 5) may begin. **Updated 2026-08-06**: the capability itself is added and written — this gate is now about `02`'s own process completing, not further design work.
- `05-ui-shell-and-navigation` has completed its own review/sign-off for the `"party"` `ShellSurface` addition and this portal's six-route entry in its route inventory (`05` design.md §3.2, §5), which resolve `design.md` §3's shared filtered shell direction. **Updated 2026-08-06**: the shell-architecture direction is settled (shared filtered shell); this gate is now about `05`'s own process completing, not an open design question.
- `10-pick-list-and-acknowledgement-receipt` and `12-vmi-billing` are approved or stable enough that their table/lifecycle contracts consumed here (§2's table list) will not change materially before this feature ships.
- `13-trading-orders-and-pricing` confirms the margin-exclusion mechanism this design assumes (query-shape-level column omission).
- `03-offline-mode-and-client-storage` confirms this portal's zero-Tier-1-surface status.
- `02-rbac-roles` has completed its own approval/sign-off process for the `reporting.read` (`assigned_party`) capability now written in `02` design.md §3.2 (`design.md` §4/§7a) before Task 5a (party-scoped analytics) below may begin. **Updated 2026-08-06**: the capability itself is added and written — this gate is now about `02`'s own process completing, not further design work.
- **Updated 2026-08-06** — all four items below are now written into their owning specs (no longer open design questions); Task 5b remains gated on each spec's own normal approval/verification process completing, not on further design work: `02-rbac-roles` has completed its own approval/sign-off process (including `rbac-rls-reviewer`) for the `shipment_labels.generate` (`assigned_party`) capability addition, restricted to inbound-supplying `party_roles` values, now written in `design.md` §3.2/§7.4 (referenced from this spec's `design.md` §4/§7c); **and** `01-core-data-model` has completed a dedicated `db-migration-verifier` pass for the `wrr_advance_notices` table, now written in `01` design.md §6 as an explicitly flagged schema amendment to an already-`Approved` spec (it does not inherit `01`'s prior verification); **and** `07-incoming-receiving` has completed its own approval/sign-off process for the confirmed matching flow, now written in `07` requirements.md R1a / design.md §5.5; **and** `18-barcode-integration` has completed its own approval/sign-off process for the 1D/linear barcode decoding exception, now written in `18` requirements.md FR-2.3 — before Task 5b (supplier-initiated barcode pre-labeling) below may begin.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Dependencies and constraints

- Every task in this file except Task 5b implements a read, never a mutation, of `parties`, `lots`, `lot_location_balances`, `pick_lists`, `pick_list_items`, `items` (via `party_visible_items` only), or (once approved) `vmi_billing_statement`/`vmi_credit_notes`. **Task 5b is this feature's one narrow exception** — a real write to the proposed `wrr_advance_notices` table, per `design.md` §7c — not a lightweight add-on to the otherwise read-only pipeline.
- One warehouse only; no `warehouse_id`. `parties`/`items`/`locations` terminology only.
- Supplies-flow (`flow_type = 'supplies'`) data must never be rendered, queried, or reachable through any task below, under any code path, for any party user — this is the single hard constraint governing every task in this file.
- Every read must go through `02`'s `requirePermission()`/RLS boundary; no task may implement an application-layer-only check as a substitute for RLS. Task 5b's one write must go through the same `requirePermission()`/RLS boundary, never an application-layer-only check.
- No task in this file may add a pricing/billing calculation, a master-data edit, or a user-access-management action — those remain out of scope per `requirements.md` §6. No task may grant `party_user` a write path into `wrr_items` or WRR creation — that remains `07`'s exclusive domain (R1.1) even after Task 5b ships.
- The VMI-statements surface (Task 5) is explicitly gated behind `02` completing its own approval/sign-off process for `vmi_statements.read` (already written in `02` design.md §3.2/§7.4) and must not be implemented against an invented, unapproved ad-hoc authorization check.
- The party analytics surface (Task 5a) is explicitly gated behind `02` completing its own approval/sign-off process for `reporting.read` (`assigned_party`) (already written in `02` design.md §3.2) and `16-reporting-and-analytics` reaching a stable/approved contract; it must not be implemented against an invented ad-hoc authorization check, and it must never define a new chart component or aggregation query — only embed `16`'s existing ones.
- The barcode pre-labeling surface (Task 5b) is explicitly gated behind `02`'s approval of `shipment_labels.generate` (`assigned_party`), `01`/`07`'s completed schema-amendment process for `wrr_advance_notices`, `07`'s formal spec-adoption of the confirmed matching flow, and `18`'s amendment to support 1D barcode decoding for this flow. It must never be implemented as a write into `wrr_items` or WRR creation, must never enter the Tier 1 offline queue, must never collect expiry/weight/dimensions/disposition fields beyond the thin form (item, non-authoritative quantity, optional supplier lot number), and must limit item selection to items already reachable through `party_visible_items` (R11's scope boundary — no pre-labeling for a never-before-shipped item).

## Implementation tasks

### 1. Resolve open reconciliation items before building routes

Maps to: `requirements.md` §7 Open Questions; `design.md` §3, §10.

Testing: Documentation/decision review; no implementation tests.

- [ ] **Resolved 2026-08-06** — confirm `05-ui-shell-and-navigation` has completed its own approval/sign-off process for the `"party"` `ShellSurface` value and this portal's six-route entry in its route inventory, already written in `05` design.md §3.2/§5 (`design.md` §3); record the outcome in `specs/00-steering/revision-log.md`.
- [ ] **Resolved 2026-08-06** — confirm `02-rbac-roles` has completed its own approval/sign-off process for the `vmi_statements.read` (`assigned_party`) capability and its RLS pattern, already written in `02` design.md §3.2/§7.4 (`design.md` §4/§7); record the outcome in `specs/00-steering/revision-log.md`.
- [ ] **Resolved 2026-08-06** — confirm `02-rbac-roles` has completed its own approval/sign-off process for the `reporting.read` (`assigned_party`) capability, already written in `02` design.md §3.2 (`design.md` §4/§7a; `requirements.md` §7 item 5); record the outcome in `specs/00-steering/revision-log.md`.
- [ ] **Updated 2026-08-06** — the design content itself is now written; this item is about process completion, not authorship. Confirm `02-rbac-roles` has completed its own approval/sign-off process (`rbac-rls-reviewer` included) for the `shipment_labels.generate` (`assigned_party`) capability and RLS pattern already written in `02` design.md §3.2/§7.4 (restricted to inbound-supplying `party_roles` values, referenced from this spec's `design.md` §4/§7c); record the outcome in `specs/00-steering/revision-log.md`.
- [ ] **Updated 2026-08-06** — confirm `01-core-data-model` has completed a dedicated `db-migration-verifier` pass for the `wrr_advance_notices` table already written in `01` design.md §6 (an explicitly flagged schema amendment to an already-`Approved` spec, not inheriting `01`'s prior verification); record the outcome in `specs/00-steering/revision-log.md`.
- [ ] **Updated 2026-08-06** — confirm `07-incoming-receiving` has completed its own approval/sign-off process for the confirmed matching flow already written in `07` requirements.md R1a / design.md §5.5.
- [ ] **Updated 2026-08-06** — confirm `18-barcode-integration` has completed its own approval/sign-off process for the 1D/linear barcode decoding exception already written in `18` requirements.md FR-2.3 (`design.md` §7c; `requirements.md` R11.11(d)).
- [ ] Confirm with `03-offline-mode-and-client-storage` that this portal's zero-Tier-1 status is explicitly acknowledged there, not merely implied by omission, including Task 5b's write (which is Tier 2, not Tier 1).
- [ ] **Resolved 2026-08-06**: party-switcher preference persistence is session-only (`requirements.md` R1.8; `design.md` §9) — no build task remains here beyond implementing that baseline in Task 7.
- [ ] Confirm the final route naming with `05` under the now-settled `app/(authenticated)/portal/...` route shape (`design.md` §3) once `05`'s own process-completion item above closes.

### 2. Authorization/context resolution layer

Maps to: `requirements.md` R1, R7; `design.md` §4, §8.

Testing: Unit tests for assignment resolution/switcher logic; real-Postgres integration for RLS boundary before sign-off.

- [ ] Implement server-side resolution of the caller's active `user_party_scopes` assignments on every request — never trusting a client-supplied `party_id`/`flow_type`.
- [ ] Implement single-assignment auto-default and multi-assignment explicit switcher, with server-side re-validation of any switcher selection against the caller's actual active assignments.
- [ ] Implement the `requirePermission(resource, action, {partyId, flowType})` call sites for every capability listed in `design.md` §4's table.
- [ ] Implement flow-based surface hiding (hide VMI position for Trading-only assignment and vice versa) at both the navigation/UI layer and the route-guard layer — never UI-only.
- [ ] Prove that a null-`flow_type` assignment on a party that is also a Supplies vendor never resolves to Supplies-flow data anywhere in this layer.

### 3. VMI inventory-position view

Maps to: `requirements.md` R2; `design.md` §5.

Testing: Unit tests for view-model shaping; real-Postgres RLS integration for the `lot_location_balances`/`party_visible_items` read path; Playwright view flow.

- [ ] Build the scoped `lot_location_balances` read joined to parent `lots`, using exactly the `02` §7.4 `can_access_party_resource('lot_location_balances', 'read', lots.owner_party_id, 'vmi')` RLS pattern — no additional application-layer party filter substituting for RLS.
- [ ] Build the `party_visible_items` join for item identity fields; assert the query never selects `default_supplier_party_id`, `buying_price`, `selling_price`, or `min_reorder_level`.
- [ ] Render occupied CBM per lot and an aggregate total from the authorized read result only.
- [ ] Confirm the view is read-only — no mutation control anywhere on this screen.
- [ ] Confirm `inventory_transactions` is never queried by this view.

### 4. Trading order/document history view

Maps to: `requirements.md` R3; `design.md` §6.

Testing: Unit tests for snapshot-field rendering; real-Postgres RLS integration for the `pick_lists`/`pick_list_items` read path; Playwright view flow.

- [ ] Build the `pick_lists` read filtered to `customer_party_id`, using `can_access_party_resource('pick_list', 'read', customer_party_id, flow_type)` — confirm the resource string is exactly `'pick_list'` (singular), not `'pick_lists'`.
- [ ] Build the order-detail view sourced entirely from `pick_list_items` snapshot fields (`lot_number`, `location_label`, quantity, UOM, frozen price) — no live join to `lots`.
- [ ] Assert at the query-shape level that margin, buying cost, and any `trading.margin_view`-gated field are never selected in any query this feature issues.
- [ ] Confirm `inventory_commitments`/`inventory_commitment_lines` are never queried by this view.
- [ ] Confirm the view is read-only — no order-creation, price-negotiation, or FIFO-override-request control anywhere on this screen.

### 5. Documents view (pick lists, acknowledgement receipts, VMI statements)

Maps to: `requirements.md` R4; `design.md` §7.

Testing: Unit tests for signed-URL request shaping; real-Postgres RLS integration for `documents.read`; Playwright document-open flow; manual QA for disclaimer text preservation.

- [ ] Build the `pick_list`/`acknowledgement_receipt` list and open flow under `documents.read` (`assigned_party`), requesting a fresh ≤60-minute signed URL on every open.
- [ ] Confirm the acknowledgement-receipt artifact is rendered unmodified, with the VMI disclaimer text present and unedited.
- [ ] **Blocked sub-task, do not start until Task 1's `02` process-completion item for `vmi_statements.read` closes** (capability already written in `02` design.md §3.2/§7.4, 2026-08-06): build the `vmi_billing_statement`/`vmi_credit_notes` list and detail view under the approved `vmi_statements.read` capability, rendering the PDF artifact only (no structured native line-item breakdown, per `requirements.md` R4.7).
- [ ] Implement the voided-statement visual treatment (status badge, not color-only) and `supersedes_statement_id` linkage once the statements view is built.
- [ ] Confirm no document-mutation, regeneration, or supersession action is reachable from this feature.

### 5a. Party-scoped analytics view

Maps to: `requirements.md` R10; `design.md` §7a.

Testing: Unit tests for flow-based view selection; real-Postgres RLS integration for the `reporting.read` (`assigned_party`) path once approved; Playwright party-scoped analytics flow; contract test proving no new chart component or aggregation query was introduced.

- [ ] **Blocked, do not start until Task 1's `02` process-completion item for `reporting.read` (`assigned_party`) closes (capability already written in `02` design.md §3.2, 2026-08-06) and `16-reporting-and-analytics` is stable/approved**: wire this portal's navigation to embed `16`'s existing `<TrendLineChart>`, `<KpiCard>`/`<KpiCardGroup>`, `<StockLevelTable>`, and `<BarChart>` components (per `16` FR-9) against `16`'s own party-scoped query layer for VMI analytics (`16` FR-5: occupied CBM trend, stock-on-hand summary, lot activity summary, billing-period reference banner) and Trading analytics (`16` FR-6: order activity trend, item movement velocity).
- [ ] Wire the existing flow-based switcher (Task 2) to select which analytics view (VMI vs. Trading) is shown, consistent with how it already selects the inventory-position vs. order-history surface.
- [ ] Assert at the query-shape level that margin, buying cost, and any `16` FR-6.3-gated field are never rendered or returned to a party-user session in this view.
- [ ] Confirm no Supplies-flow analytics is ever reachable from this view.
- [ ] Confirm this task introduces zero new chart components and zero new aggregation queries — every visual element is an embedded `16` component.
- [ ] Confirm the view is read-only — no export or mutation control anywhere on this screen.

### 5b. Supplier-initiated barcode pre-labeling of inbound dispatches

Maps to: `requirements.md` R11 (including R11.1a's hybrid-party exclusion); `design.md` §4, §7c, §8, §9.

Testing: Unit tests for thin-form validation, non-authoritative-quantity UI framing, and the hybrid-party exclusion; real-Postgres RLS integration for the `wrr_advance_notices` write path (three-condition WITH CHECK: capability/scope, non-hybrid inbound-supplying `party_roles` via `party_has_any_role`, `item_id`/`party_visible_items` reachability) once `01`/`07` land the schema; Playwright end-to-end flow (supplier submits, back office confirms into a `wrr_items` line, floor scan matches it); manual QA confirming UI copy never implies the declared quantity is authoritative.

**Updated 2026-08-06**: `02` design.md §7.4/§7.4a was revised in response to a first-pass `rbac-rls-reviewer` review that found six real gaps in the `wrr_advance_notices`/`shipment_labels.generate` design (`revision-log.md`, 2026-08-06 entry). All six are now fixed at the design level, but **re-verification via a fresh `db-migration-verifier`/`rbac-rls-reviewer` pass against the corrected design has not yet happened** — this remains an open item on top of the pre-existing four blockers below, not a new fifth blocker, since it is scoped entirely within `02`'s own not-yet-complete verification process.

- [ ] **Blocked, do not start until Task 1's `02`/`01`/`07`/`18` process-completion items close, including a fresh verification pass against `02`'s 2026-08-06 corrected `wrr_advance_notices` RLS design** (design content itself is settled as of 2026-08-06; this is a verification/sign-off gate, not a design gap): build the thin barcode-label form (item selected via `party_visible_items`, limited to the scope boundary of already-reachable items, quantity for this label declared as non-authoritative, optional supplier lot number) restricted to callers whose active assignment satisfies requirements.md R1.7's inbound-supplying `party_roles` check (`vendor`/`supplier`), never `customer`/`end_customer`, **and** excluded per R11.1a if the party also holds a `customer`/`end_customer` role (hybrid-party exclusion).
- [ ] Build the server-action write of a new `wrr_advance_notices` row under the approved `shipment_labels.generate` (`assigned_party`) capability, scoped to the caller's own `party_id`, going through the same `requirePermission()`/RLS boundary as every read in this feature — no application-layer-only check substituting for RLS. The server action's own pre-checks (role, item reachability) are fast-fail UX only; the actual enforcement is `02` design.md §7.4's three-condition RLS WITH CHECK.
- [ ] Generate the 1D barcode payload as a UUID pointer (`WAN:<uuid>`) to the new row, never an embedded data blob, consistent with `18` requirements.md FR-3.2; keep the payload/lookup mechanism format-neutral so a future QR migration only changes rendering/encoding, not the underlying data model.
- [ ] Confirm this task never writes to `wrr_items` or creates a `wrr_documents` row directly — those remain reachable only through `07`'s own back-office confirmation flow, via the controlled `SECURITY DEFINER` function specified in `02` design.md §7.4a.
- [ ] Confirm the UI states, explicitly and prominently, that the declared quantity is not authoritative and that `07`'s scanned-vs-expected discrepancy handling (R3.2, R3.3) still runs unchanged at physical receipt.
- [ ] Confirm this submission is online-only (Tier 2) and never registered with or reachable from the Tier 1 offline queue.
- [ ] Confirm the write is attributable to the actor and correlation ID through the approved audit boundary (`design.md` §9), consistent with requirements.md R7.5.
- [ ] Confirm no `expiry`, `weight`, `dimensions`, or `disposition` field is ever collected on this form.
- [ ] Confirm a hybrid party (both an inbound-supplying role and a customer-facing role) is rejected at the RLS level (`02` §7.4 condition 2), not merely hidden in the UI — per R11.1a.

### 6. Notifications center

Maps to: `requirements.md` R6; `design.md` §9.

Testing: Unit tests for recipient-scoping logic reuse; real-Postgres RLS integration for `notifications.read`; Playwright notification-open flow.

- [ ] Integrate `14`'s existing notification-center component/contract (unread count, filters, read/dismiss state) scoped to the caller's active party/flow assignment — do not build a competing notification model.
- [ ] Confirm notification links re-authorize on open and fail safely (not-found/forbidden without existence leakage) when the underlying resource is out of the caller's current scope.

### 7. Party-switcher and self-party read

Maps to: `requirements.md` R1, R5; `design.md` §3, §8.

Testing: Unit tests for switcher UI state; real-Postgres RLS integration for the `parties` self-row read; Playwright multi-assignment flow.

- [ ] Build the party/flow switcher component, rendered in the shell's account/context area (`05`'s shared shell, resolved 2026-08-06 in Task 1) — session-only, no persisted preference (`requirements.md` R1.8).
- [ ] Build the caller's own `parties` self-row read via `can_access_party_resource('parties', 'read', id, null)` — read-only, no edit control.
- [ ] Prove no combined/aggregated cross-party or cross-flow view is reachable in a single request.
- [ ] Confirm no party/flow selection is persisted anywhere (session-only per `requirements.md` R1.8, product owner decision 2026-08-06) — no new storage, no `21` preference write for this v1.

### 8. Shell, offline, and cross-cutting integration

Maps to: `requirements.md` R8, R9; `design.md` §3, §9.

Testing: Type-check/build contract; Playwright shell smoke tests; offline-mode negative tests.

- [ ] Mount routes under `05`'s shared `app/(authenticated)/` layout using the `"party"` `ShellSurface` value (`05` design.md §3.2/§5, resolved 2026-08-06) — not a distinct external layout.
- [ ] Confirm no view in this feature persists data for offline access; every load is a fresh authoritative read.
- [ ] Confirm no action in this feature is registered with or reachable from the offline Tier 1 queue.
- [ ] Apply approved brand tokens, typography, contrast (AA office tier), 44px touch targets, and hover/press rules — confirm no floor-context pattern (64px buttons, thumb-zone layout, single-primary-action) was applied.
- [ ] Add correlation IDs and redacted monitoring context for failed portal reads, per `04`'s conventions.

### 9. Testing and review

Testing: All applicable layers below.

- [ ] Run `rbac-rls-reviewer` against every read path in this feature, with explicit focus on: the Supplies-exclusion redundancy, cross-party/cross-flow inference through IDs/counts/filters/errors, and the `vmi_statements.read` proposal once ruled on.
- [ ] Run `design-system-auditor` against the office/mobile layout.
- [ ] Run real-Postgres migrations/integration tests before sign-off for every RLS pattern this feature depends on (reusing `02`'s already-verified patterns; only feature-specific query shapes need fresh assertions here).
- [ ] Add representative feature contract tests proving this feature can consume `10`/`12`/`13`/`14`'s outputs without duplicating their business logic.

## Testing matrix

### Unit tests (Vitest)

- [ ] Active-assignment resolution: single-assignment default, multi-assignment switcher validation, rejection of a client-supplied assignment not in the caller's actual active set.
- [ ] Flow-based surface visibility logic (VMI-only, Trading-only, unnarrowed/both).
- [ ] Query-shape assertions: VMI position query never selects restricted `items` columns; Trading order query never selects margin/cost columns.
- [ ] Notification recipient-scoping reuse (no competing filtering logic introduced).
- [ ] Voided-statement/supersession display logic (once Task 5's blocked sub-task is unblocked).
- [ ] Thin-form validation for the barcode pre-label form (item, quantity, optional supplier lot number) — no other field accepted (once Task 5b is unblocked).
- [ ] Non-authoritative-quantity UI framing: assert the copy/component explicitly states the declared quantity is not authoritative (once Task 5b is unblocked).

### Integration tests

- [ ] Real Postgres: verify the VMI `lot_location_balances`/`lots`/`party_visible_items` RLS chain returns only the authorized party's rows, using real VMI/Trading/Supplies-partitioned data for the same and different parties.
- [ ] Real Postgres: verify the Trading `pick_lists`/`pick_list_items` RLS chain, confirming the `'pick_list'` resource-key correctness and zero direct `lots`/`inventory_transactions` access.
- [ ] Real Postgres: verify a null-`flow_type` assignment on a party with both VMI/Trading and Supplies records never returns Supplies rows through any query path in this feature.
- [ ] Real Postgres: verify the `parties` self-row read returns exactly one row (the caller's own) and no others.
- [ ] Real Postgres: verify `documents.read`-gated signed-URL requests fail for a document outside the caller's current party/flow scope.
- [ ] Real Postgres (once unblocked): verify `vmi_statements.read` RLS returns only the caller's own `vmi_billing_statement`/`vmi_credit_notes` rows.
- [ ] Real Postgres (once `01`/`07`'s `wrr_advance_notices` schema amendment lands): verify the `shipment_labels.generate` (`assigned_party`) INSERT policy accepts writes only from callers whose active `party_roles` value is inbound-supplying (`vendor`/`supplier`) and whose `party_id` matches, rejects a `customer`/`end_customer` caller and a cross-party `party_id` under real data, and rejects a selected item not reachable through `party_visible_items`.

### E2E tests (Playwright)

- [ ] VMI party user signs in, sees inventory-position view, sees no Trading/order surfaces (when flow-narrowed).
- [ ] Trading party user signs in, sees order/document history with final price only, no margin/cost visible anywhere in the DOM or network responses.
- [ ] Multi-assignment party user is presented the switcher, selects an assignment, and every subsequent view re-scopes correctly.
- [ ] Party user opens a document, receives a signed URL, confirms the URL expires/re-authorizes on a later request outside the window.
- [ ] Party user cannot reach another party's data via direct route/ID manipulation, filter tampering, or URL guessing — fails safely (not-found/forbidden, no existence leakage).
- [ ] Party user's notification center shows only their own scoped notices.
- [ ] Party user sees only their own party's analytics in the party analytics view (VMI or Trading, per assignment), never another party's, never a Supplies-flow analytics view, and never a margin/cost field anywhere in the DOM or network responses.
- [ ] Offline simulation: portal shows no stale/cached data as current and no portal action queues offline, including Task 5b's submission, which must fail cleanly offline rather than queue.
- [ ] Portal remains usable and keyboard-navigable at representative office/mobile widths.
- [ ] An inbound-supplying party user (VMI vendor or Trading `vendor`/`supplier`) submits the thin barcode-label form, receives a generated UUID-pointer 1D barcode label, back office confirms/converts the advance notice into a staged `wrr_items` line, and a floor scan at receipt matches the code to that line — without bypassing `07`'s scanned-vs-expected discrepancy handling. A Trading `customer`/`end_customer` never sees this surface, tested explicitly (once Task 5b is unblocked).

### Manual QA

- [ ] Verify the VMI acknowledgement-receipt disclaimer text is present, unedited, and matches `10`/`12`'s approved wording.
- [ ] Verify no UI text implies a `pick_list_items`/acknowledgement-receipt price is the authoritative VMI bill.
- [ ] Verify no `suppliers`, `SKU`, `bins`, or `warehouse_id` terminology appears anywhere in this feature's UI copy.
- [ ] Verify the voided-statement badge is not color-only (icon/text pairing present).
- [ ] Verify Supplies-flow terminology/data never appears in any party-user-facing screen, including error states and empty states.
- [ ] Verify the barcode pre-label form's UI copy does not imply the declared quantity is authoritative — it must read as a labeling convenience only, with `07`'s physical count remaining the source of truth (once Task 5b is unblocked).

## Sign-off

- [ ] `02-rbac-roles` capability catalog (including `vmi_statements.read`, `reporting.read` (`assigned_party`), and `shipment_labels.generate` (`assigned_party`) extensions) is approved and reconciled.
- [ ] `16-reporting-and-analytics` party-scoped analytics contract (FR-5, FR-6, FR-9) is stable/approved for what Task 5a embeds, if Task 5a was implemented.
- [ ] `05-ui-shell-and-navigation` has completed its own review/testing/sign-off for the `"party"` `ShellSurface` value and this portal's route-inventory entry (resolved direction, 2026-08-06, reflected in `design.md` §3).
- [ ] `10-pick-list-and-acknowledgement-receipt` and `12-vmi-billing` are stable/approved for the contracts this feature consumes.
- [ ] `13-trading-orders-and-pricing` margin-exclusion mechanism is confirmed compatible.
- [ ] `03-offline-mode-and-client-storage` confirms zero-Tier-1-surface status explicitly, including Task 5b's write.
- [x] **`wrr_advance_notices` schema — verified.** `01-core-data-model` has run three real-Postgres `db-migration-verifier` passes against design.md §6 (pass 1: base schema, FKs, enum, nullability, RESTRICT-on-delete, all PASS, one compile bug found/fixed; pass 2/3: the table under the corrected RLS layer, all scenarios PASS). This is a verified schema amendment to an already-`Approved` spec — it does not retroactively change `01`'s `Status` or its existing Sign-off record, which remains accurate for the content it originally covered.
- [x] **`shipment_labels.generate`/`wrr_advance_notices` RLS — verified.** `02-rbac-roles` design.md §3.2/§7.2/§7.4/§7.4a's four-condition WITH CHECK policy has been through three `rbac-rls-reviewer` design-review rounds (round 1: six real gaps found — flow_type column missing, hybrid-party bypass, capability substitution, unscoped item_id, undocumented helper-recursion risk, undesigned back-office write path; round 2 confirmed four of six fixes sound and found two further gaps — a missing `REVOKE EXECUTE FROM PUBLIC` on the new helper and two missing adversarial test bullets, both closed directly; round 3, scoped to `07`'s new §5.5 consumption of this mechanism, found the back-office confirm/reject action had no self-review prohibition analogous to `02` §3.4's FIFO-override check) and five real-Postgres `db-migration-verifier` passes (all 8 test bullets in `02` §13's `wrr_advance_notices` list now checked PASS, including the hybrid-party exclusion, cross-party IDOR, item-reachability, capability-substitution regression, the Supplies CHECK/NOT-NULL pair, the `party_has_any_role` RLS-bypass property, and — added to close round 3's finding — the self-review-prohibition mechanism and its supporting `submitted_by_user_id` column, which pass 4 found was itself spoofable before a fourth WITH CHECK condition closed it in pass 5). **Not yet re-run by `rbac-rls-reviewer` specifically**: the narrow mechanical fixes from round 2 (the `REVOKE` statement, the two test bullets, the §7.4a owning-role note) were applied directly rather than re-submitted for a review round — low-risk, mirrors an already-verified pattern from the other four helpers, but flagged here rather than silently assumed clean.
- [ ] `01-core-data-model`'s `flow_type`/`wrr_advance_notices` amendment and `02`'s new capability rows do not themselves need further sign-off beyond the verification above (both specs' base `Status: Approved` already stands) — but `07-incoming-receiving` and `18-barcode-integration` have **not** completed their own approval/sign-off process at all (`07` R1a/§5.5 and `18` FR-2.3 are written but neither spec has been reviewed, tested, or brought anywhere near `Approved` — both remain far from that state independent of this feature). Task 5b remains blocked on this.
- [ ] RBAC/RLS review (`rbac-rls-reviewer`) passes for every other read/write path in this feature beyond `shipment_labels.generate`/`wrr_advance_notices` (which is verified above) — R1–R10's paths (VMI position, Trading orders, documents, VMI statements, notifications, analytics) have not been through `rbac-rls-reviewer` in this session.
- [x] `design-system-auditor` review passes for this document overall, with three minor precision gaps found and fixed directly (2026-08-06: office "hover/press" overclaim, unenforced voided-statement-badge mechanism, §7c's new form not citing inherited office/Forms rules) — not independently re-audited after the fixes, same low-risk/mechanical caveat as above.
- [ ] All applicable tests pass, including real-Postgres testing, for the parts of this feature beyond `shipment_labels.generate`/`wrr_advance_notices` — most of R1–R10 has no test coverage yet and depends on the approved contracts from `10`, `12`, `13`, `14`, and `16`.
- [ ] No offline mutation/read-caching leakage is present.
- [ ] No Supplies-flow data leakage is present under any tested scenario.
- [ ] Product owner approval — Name: __________ Date: __________
- [ ] Second approver approval — Name/Role: __________ Date: __________

This spec cannot reach `Approved` until every item above is genuinely satisfied — per this repo's process, only the product owner (or the standing auto-sign-off arrangement once every other gate is truly closed) changes `Status` to `Approved`; this document does not set that itself.
