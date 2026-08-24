# Incoming Receiving — Design

Status: Approved
Updated: 2026-08-24 (Product Owner decision: batch putaway model adopted, per-unit model retired) — resolves the `fix-it-felix` merge contradiction flagged the same day (former §9.0, now folded into §9). The batch putaway allocation model is now the sole authoritative `store`/`inspect`-line commit design, implemented in `commitWrrLine` (`lib/actions/receiving.ts`). The 2026-08-20/21 per-unit scan-suggest-commit-per-unit design (former §6.2-§6.2b's per-unit wording, `commitStoreUnit`/`commitInspectLine`, per-unit idempotency-key machinery) is retired and removed from this document; its implementation has been deleted from the codebase. `inventory_units` (added 2026-08-23/24) remains a live, additive extension — layered onto the batch model instead of the per-unit model it was originally described against. See `specs/00-steering/revision-log.md`'s 2026-08-24 entry for the full account.

## 1. Design intent

Incoming Receiving is a two-surface workflow:

1. An office-oriented pre-receiving surface encodes and prints a WRR from an external CIPL/packing-list reference.
2. A floor-oriented receiving surface reconciles physical carton scans and inbound inspection results, then submits one authoritative receipt commit.

The design preserves the boundary between expectation and inventory: `wrr_documents`/`wrr_items` describe expected inbound goods; active lots and `inventory_transactions` are created only by the authorized commit transaction. The commit creates one of two inbound posting paths — `store` (available at putaway) or `inspect` (quarantined at inspection location) — based on the per-line disposition field set before confirmation.

## 2. Foundational dependencies and core tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, `ui-ux-design-plan.md`, and `revision-log.md`.
- `01-core-data-model` for the canonical inbound schema and immutable ledger design.
- `02-rbac-roles` for capabilities, party/flow scope, RLS, and current-request authorization.
- `03-offline-mode-and-client-storage` for the limited Tier 1 scan queue and replay rules.
- `04-services-and-infrastructure` for Supabase Auth, private Storage, server transactions, Realtime, email, monitoring, and migration boundaries.
- `05-ui-shell-and-navigation` for authenticated route/layout, floor/office surfaces, page headers, and shared status/error regions.
- `06-party-and-item-enrollment` for online unknown-item resolution.
- `11-transfer-and-inspection` as the shared inspection handler for quarantined-lot resolution and evidence after the commit emits an inspection case event.
- `22-parties-portal` (**added 2026-08-06**) requirements.md R11 / design.md §7c, as the originating requirement for §5.5's supplier advance-notice intake — `22` owns the party-facing submission surface and the `wrr_advance_notices` write; `07` owns confirmation/rejection and the physical-scan match.
- `18-barcode-integration` (**added 2026-08-06**) requirements.md FR-2.3, for the 1D/Code 128 decode of the `WAN:<uuid>` advance-notice payload at the receiving bay, consumed by this spec's existing R3/§6 barcode-reconciliation flow.

### Tables touched by this feature

| Table | Use | Boundary |
| --- | --- | --- |
| `parties` | Resolve source party and authorized party/flow context. | Master data owned by `06`; receiving does not edit parties. |
| `items` | Resolve barcode/item identity and read packaging/UOM/volume/perishability data. | Master data owned by `06`; unknown items follow its enrollment path. |
| `locations` | Resolve `receiving_bay`, `inspection` (for quarantined inbound stock), and putaway recommendations/confirmation. | Location master/physical configuration is owned by the appropriate core/location feature. |
| `lots` | Create the approved inbound lot during receipt commit. Status is `available` for `store` disposition or `quarantined` for `inspect` disposition. | Core/inventory transaction boundary owns invariant enforcement. |
| `lot_location_balances` | Created at commit for each selected allocation: one putaway location row per `store` allocation, or one inspection-location row for `inspect`. These rows are the authoritative source for `lot_inventory_totals`. | Core schema owns fields and constraints; receiving inserts via the commit transaction. |
| `wrr_documents` | Store staged WRR header and lifecycle. | Core schema owns fields/status constraints; receiving owns workflow commands. |
| `wrr_items` | Store expected lines, scan reconciliation state, and per-line disposition. | Core schema owns fields; receiving owns matching behavior. `putaway_location_id` is set only for a single-location commit and left unset once a `store` line's batch placement splits across more than one location (§5.1, §8) — `lot_location_balances` is authoritative. |
| `wrr_item_putaway_allocations` (migration `0032_wrr_item_putaway_allocations.sql`, migrated and live) | Staged, non-inventory record of a `store` line's per-location placement quantities, posted alongside the line's single commit for audit/traceability. | Receiving owns the write; inserted only for `store`-disposition batch commits, in the same transaction as `lot_location_balances`/`inventory_transactions`. |
| `inventory_units` (added 2026-08-23/24, `01-core-data-model` schema, not redefined here) | One durable row per physical carton/box QR, layered on top of `lot_location_balances` (not a replacement stock table). Written once per box during the line's single batch commit (§9), consumed by `08`'s exact-box dispatch scan (requirements.md R3.3). | Core/inventory transaction boundary owns invariant enforcement; receiving only inserts it inside the same line-commit transaction that already creates the matching `lot_location_balances`/`inventory_transactions` rows. |
| `wrr_inspection_logs` | Store inbound physical conformance/non-conformance observations during arrival. Distinct from post-commit quarantine resolution owned by `11`. | Retained by approved core schema; receiving owns the write path during the scan/conformance phase. |
| `inventory_transactions` | Insert immutable receiving movements through server transactions. Both `store` and `inspect` dispositions insert a `movement_type = 'receiving'` record at commit. | No updates/deletes; inventory transaction boundary is authoritative. |
| `wrr_advance_notices` (**added 2026-08-06, schema amendment not yet through `db-migration-verifier`** — see `01-core-data-model` design.md §6) | Confirm (creating/matching a staged `wrr_items` line) or reject a party-submitted pre-arrival label; resolve its `matched_wrr_item_id` at a physical scan of its `WAN:<uuid>` barcode. | Written by `22-parties-portal`'s party-facing surface only. `07` owns the confirm/reject transition and the scan-match consumption; `07` never writes an initial `wrr_advance_notices` row. |

Receipt confirmation creates `lots` plus one `lot_location_balances` row per committed line. This design does not invent `stock_levels` or another duplicate ledger table.

## 3. Route and shell integration

Provisional App Router surfaces:

```text
app/(authenticated)/
  receiving/
    page.tsx                         # WRR list / receiving work queue, with a
                                      #   "Ledger" tab (confirmed-only,
                                      #   read-only transaction view) —
                                      #   merged 2026-08-09; see below
    new/page.tsx                     # office pre-receiving form
    [wrrId]/page.tsx                 # WRR detail/review
    [wrrId]/print/page.tsx           # printable WRR
    [wrrId]/receive/page.tsx         # floor scan/reconciliation flow
    [wrrId]/inspection/page.tsx      # inbound inspection/conformance
```

**2026-08-09 restructuring**: the standalone `incoming-ledger/page.tsx` route
that previously sat here as a sibling of `receiving/` has been removed. The
Incoming Ledger is now the "Ledger" tab on `receiving/page.tsx` itself
(`?tab=ledger`), not a separate top-level route — the Product Owner
corrected an earlier build mistake where it had been split into its own
route despite this design's own §10 describing it as part of the receiving
work-queue surface. `receiving/page.tsx`'s default tab ("Work Queue") is
unchanged from before. Tabs are used here because this specific page (the
WRR list/queue) is functionally an office review/list screen — glassmorphism
Level 1 cards, table, hover states — per `ui-ux-design-plan.md` §3's rule
that tabs are an office pattern; the floor-oriented scan/reconciliation
route (`[wrrId]/receive/page.tsx`) is unaffected and remains a
single-column, one-primary-action floor screen.

Route names and capability references remain provisional until `05`, `02`, and the feature route inventory are approved.

- Office routes use the shared office shell and page-header/list/form contracts.
- The floor receive route opts into the floor surface: 16px padding, solid surfaces, scanner-ready input, no dense table, no persistent sidebar during active scanning, and one primary action.
- The print route uses the brand system as the source of truth for generated documents and is not a second editable WRR form.
- Feature content owns scan feedback, remaining-quantity cards, inspection choices, disposition display, and receipt confirmation. The shell owns global session/navigation/status boundaries.

## 4. State model and command boundaries

**Updated 2026-08-10, re-amended 2026-08-24 (retires the 2026-08-20/21 per-unit re-scoping)**: the diagram below reflects per-line immediate commit (§9) — each WRR line commits as its own atomic step, once, replacing both the original single end-of-WRR "confirm receipt command" gate and the 2026-08-20/21 per-unit commit loop that briefly replaced it. A `store`-disposition line's declared quantity MAY be split across more than one location within that single commit (§6.2, batch placement). The WRR only reaches `confirmed` once every line has reached a terminal commit outcome.

```text
Create WRR → staged_pending_arrival
                  │ print/review
                  ▼
          start receiving command
                  ▼
         receiving_in_progress
          ├── scan/reconcile (per carton/pallet, §6)
          ├── "Store" commit (store-disposition line, whole line, §6.2) →
          │     lots (available) + lot_location_balances (putaway, one row
          │     per assigned location — possibly split across >1 location,
          │     §6.2b) + inventory_units (one row per box) +
          │     inventory_transactions (§9) — one commit per line
          ├── "Hold" commit (inspect-disposition line, whole line, §6.3) →
          │     lots (quarantined) + lot_location_balances (inspection) +
          │     inventory_units + inventory_transactions + inspection case
          │     event for 11 (§9)
          └── exception resolution
                  │ every line reaches a terminal commit outcome (or the
                  │ line is discarded/cancelled) — `receiving_in_progress`
                  │ covers this whole window, whether 0 or N-1 of N lines
                  │ are committed (resolved 2026-08-10, §9)
                  ▼
               confirmed
          └── putaway suggestion shown once a line has its first accepted
              scan (§6.2, §6.2a, §10)
```

Every mutation is a server action/route-handler command with this sequence:

```text
session → capability/scope → input/schema → current WRR state
       → domain checks → idempotency key → database transaction
       → safe result + revalidation
```

No client command directly updates `lots`, `lot_location_balances`, or `inventory_transactions`. **Amended 2026-08-24, supersedes the 2026-08-20 per-unit wording**: each line's "Store"/"Hold" command owns its own database transaction that checks that line's prerequisites, writes the resulting domain records for every location assigned in that line's placement, and records the immutable ledger outcome. If a line's transaction fails, that line remains in a safe prior (scanned-not-committed) state; every other line's already-committed state is unaffected. A line is considered committed once its single "Store"/"Hold" command succeeds (§9); there is no per-unit intermediate commit state.

## 5. Pre-receiving WRR design

The office form captures the approved CIPL/packing-list reference and structured expected lines. The CIPL file is an external reference; it is stored privately and is not machine-parsed in v1. Structured CIPL parsing is not in scope.

### 5.1 Expected line fields

All fields confirmed from the approved `01-core-data-model` schema, plus the `disposition` field to be added via `01` amendment:

| Field | Column | Notes |
| --- | --- | --- |
| Resolved item | `wrr_items.item_id` | Nullable until enrollment; required for commit. |
| Supplier part number | `wrr_items.item_code` | From CIPL. |
| Customer part number | `wrr_items.customer_item_code` | From CIPL. |
| Lot number | `wrr_items.lot_number` | **Single canonical business lot identifier.** `NOT NULL`. Copied verbatim to `lots.lot_number` at commit. There is no vendor lot number field; this is the only lot identifier on the line. |
| Expected quantity | `wrr_items.expected_qty` | Expected carton/unit count. |
| Scanned quantity | `wrr_items.scanned_qty` | Running scan total; updated by scan commands, default 0. |
| Unit CBM | `wrr_items.unit_cbm` | Per-carton CBM for putaway calculations. |
| UOM | `wrr_items.uom` | Unit of measure. |
| Disposition | `wrr_items.disposition` | `store` or `inspect`. Determines lot status and posting location at commit. To be added to `01` via schema amendment. |
| Putaway location | `wrr_items.putaway_location_id` | **Reversed 2026-08-10 (supersedes the 2026-08-09 Product Owner decision — see `specs/00-steering/revision-log.md`).** No longer required, set, or even meaningfully choosable at WRR-creation time — at staging time the system does not yet know what will actually be scanned, so a location cannot be suggested against real item CBM/capacity data. The column (already nullable in `01`'s schema; no migration proposed by this amendment) is now populated per line at its single Store commit, per §6. `store`-disposition lines carry `putaway_location_id = NULL` from WRR creation through the start of receiving. **Re-interpreted 2026-08-24 (supersedes the 2026-08-20 per-unit wording)**: this column is set to the single chosen location only when a line's whole declared quantity is committed to one location; when the line's batch placement (§6.2) splits across more than one location, the column is left unset (not "most-recently-used" — the per-unit model that produced that meaning no longer exists). The authoritative, complete record of which quantities sit at which location for a given lot is always `lot_location_balances` (§9), never this column, whether or not a line has split. |

### 5.2 Scan-line state and discrepancy

Each `wrr_items` row tracks `scanned_qty` against `expected_qty`. Discrepancy states:

| State | Condition | Confirmable? |
| --- | --- | --- |
| Matched | `scanned_qty = expected_qty` | Yes |
| Under-scanned | `scanned_qty < expected_qty` | No — resolve by scanning more or approving a shortage discrepancy |
| Over-scanned | `scanned_qty > expected_qty` | Rejected at scan time; not silently accepted |
| Exception/unresolved | Rejected scan, unknown item, or pending inspection decision | No |

`wrr_inspection_logs` records physical conformance observations per line during the scan phase. Its `action_taken` field (`'accepted_with_variance'`, `'quarantined'`, `'returned_to_vendor'`) captures the immediate physical resolution outcome. This is distinct from the `disposition` field, which is set before confirmation and determines where the committed lot is posted.

### 5.2a Visual receiving inspection

Visual inspection is an explicit floor step after scan reconciliation and before confirmation. A WRR line may split into conformant, `on_hold`, and `reject` quantities. `on_hold` records a controlled reason, mandatory remarks, exact quantity, actor, timestamps, and holding `location`; `reject` records the same evidence, routes to an enrolled rejects `location`, and creates the linked RTV workflow. No rejected or held quantity is eligible available stock.

### 5.3 WRR printed fields

The generated WRR document SHALL include the following fields:

**Header section:**

- WRR number rendered as a scannable barcode (e.g. `WRR-2026-00001`)
- Date of document generation
- CIPL/commercial invoice reference number
- Source party (vendor) name and code
- Flow type (`vmi` / `trading` / `supplies`)
- PEZA permit number and import permit (IP) number where applicable
- MAWB/MBL (Master Air Waybill / Bill of Lading) number where applicable

**Per-line section (one row per `wrr_items` record):**

- Item code (Dyna-Serv item code)
- Item name/description
- Lot number
- Expected quantity and UOM
- Unit CBM
- Disposition (`STORE` or `INSPECT`)
- Scanned quantity column (blank at print time; completed on the floor)

**Footer section:**

- Received by — signature line
- Checked by — signature line
- Supervisor — signature line
- Warehouse stamp area

### 5.4 Print and reprint behavior

Printing is generated from the staged server record and does not create a receipt outcome. Any user with the `receiving.view` capability MAY reprint a WRR at any lifecycle status. A reprint SHALL be visibly watermarked "REPRINT" with the reprint timestamp and the identity of the reprinting user. Reprinting does not change WRR status, does not create inventory, and does not alter the scan baseline.

The form supports draft validation before save, server uniqueness/relationship checks, and an explicit transition to staged status. Editing is allowed while staged; once receiving starts, the scan baseline is immutable or changes through a visible versioned correction flow.

### 5.5 Supplier advance-notice intake

**Added 2026-08-06**, formally adopting `22-parties-portal` design.md §7c's confirmed matching flow into `07`, per that spec's blocking dependency (c). This covers requirements.md R1a.

`wrr_advance_notices` is written exclusively by `22-parties-portal`'s party-facing portal, under its proposed `shipment_labels.generate` (`assigned_party`) capability, restricted to a caller whose party holds an inbound-supplying `party_roles` value (`vendor`/`supplier`). `07` never grants a party user any write path into this table or into `wrr_items`/WRR creation — R1.1's reservation of WRR creation to an authorized back-office user is unchanged.

**Flow:**

1. The party submits the thin form (item, non-authoritative `declared_qty`, optional `supplier_lot_number`), creating a `wrr_advance_notices` row with `status = 'pending_review'`.
2. A back-office user holding `receiving.view` (review/read) and `receiving.confirm` (confirm/reject/match), using the existing global capabilities from `02-rbac-roles` design.md §3.2, in a new review surface on this feature's WRR work queue, sees pending advance notices and reviews each against the actual CIPL they have separately received. They either:
   - **Confirm**: create a new staged `wrr_items` line (or match to one they are already staging) — carrying over `item_id` and `party_id`/`vendor_party_id` reference, and starting `expected_qty` from the advance notice's `declared_qty` as an editable, non-authoritative default the back-office user adjusts against the actual CIPL. This sets `wrr_advance_notices.matched_wrr_item_id`, `status = 'confirmed'`, `confirmed_at`, `confirmed_by_user_id`.
   - **Reject/flag**: set `status = 'rejected'`, `confirmed_at`, `confirmed_by_user_id`, with no `wrr_items` line created or matched. The discrepancy is handled through the same manual-follow-up path this spec already uses for other pre-receiving discrepancies.

   Both the confirm and reject write are performed through `02-rbac-roles` design.md §7.4a's controlled `SECURITY DEFINER` function, not an ordinary Server Action with only an app-layer role check — the function independently re-verifies `receiving.confirm` inside its own transaction, the same defense-in-depth requirement `02` §8 applies to every other privileged function in that spec. This is stated here explicitly (rather than left to be inferred from `02` alone) so an implementation built from this document's own text doesn't default to a weaker app-layer-only check.

   **Self-review prohibition (added 2026-08-06, `rbac-rls-reviewer` finding)**: the confirming/rejecting function additionally verifies the caller is not the same identity as the `party_user` who submitted the advance notice being acted on. Nothing in `02`'s role model makes `party_user` and internal-staff role grants mutually exclusive on a single account, so this cannot be assumed from role separation alone — it requires the same explicit, named check `02` §3.4 already applies to FIFO-override self-approval (comparing the acting user against the submitting identity, not just checking that the acting user holds the confirm/reject capability). The exact field/mechanism is `02`'s to define alongside the confirm/reject capability name itself (§7.4a); this paragraph states the requirement so it isn't silently dropped when that capability is named.
3. At the receiving bay, `18-barcode-integration` requirements.md FR-2.3's 1D/Code 128 decode resolves a `WAN:<uuid>` payload to its `wrr_advance_notices` row. §6's matcher below resolves the linked `wrr_items` line via `matched_wrr_item_id` and proceeds through the existing scan-reconciliation path (scanned-vs-expected tracking, over/duplicate rejection) exactly as it would for any other WRR line.
4. **If the advance notice was never confirmed before the scan occurs** (still `pending_review`, or `rejected`), the scan resolves no `wrr_items` line and falls through to §6's existing unknown/unmatched exception path (requirements.md R3.3) unchanged — no new bespoke error state is introduced for this case.

This is a pure intake/matching addition to the existing pre-receiving/receiving-bay design; it introduces no new commit-transaction behavior in §9 and no new lot-posting path in §7 — a confirmed advance notice only ever results in an ordinary staged `wrr_items` line, which then goes through this spec's existing commit path exactly like a line created without an advance notice. The confirm/reject/match capability decision is resolved by reusing the existing global `receiving.confirm` capability; the controlled function must independently re-check it.

## 6. Floor scan and reconciliation design

The scan screen is a card/list workflow, not a dense table. It shows one current line/next action, total expected, scanned, remaining, and a clear exception state. Scanner input is treated as keyboard-like input per `testing.md`; the feature may provide a manual recovery input with the same validation path.

The matcher resolves:

```text
scanned barcode → active item identity → current WRR line(s)
                  → expected quantity/UOM/lot context
```

It rejects wrong WRR, wrong item, unknown item, duplicate/over quantity, invalid UOM, unresolved lot context, and — **added 2026-08-10** — flow-type mismatch (below). A rejected scan does not increment the accepted line count.

**Added 2026-08-06**: a `WAN:<uuid>` payload (per `18-barcode-integration` requirements.md FR-2.3) resolves through a distinct lookup path — `wrr_advance_notices.id` → `matched_wrr_item_id` → the linked `wrr_items` line — before the same scanned-vs-expected reconciliation applies. If the advance notice has no `matched_wrr_item_id` (never confirmed), this falls through to the unknown/unmatched exception path below, per §5.5.

If the item is unknown, the screen routes to the online `06` enrollment flow or records an exception. After enrollment, the scan is repeated and revalidated; the original rejected event is not retroactively accepted.

The disposition value for each line is visible on the floor scan screen. A floor supervisor with appropriate capability may change a line's disposition from `store` to `inspect` (or vice versa) before triggering confirmation.

### 6.1 Flow-type cross-check (added 2026-08-10)

**No manual flow-type selection at scan time.** `flow_type` is already required and captured on `wrr_documents` at WRR creation (§2's table, `wrr_documents.flow_type NOT NULL`) and independently on each `items` row at enrollment (`01-core-data-model` design.md §5.7, the unified enrollment form's primary `flow_type` selection). Staff scanning at the receiving bay are never asked to pick a flow — they don't know what's arriving until they scan.

Instead, the matcher adds one more check to the resolution sequence in §6: once a scanned barcode resolves to an active `item`, its own `items.flow_type` is compared against the current WRR's `wrr_documents.flow_type`. A mismatch is rejected through the same exception path as any other wrong-item/wrong-WRR scan (§6, requirements.md R3.3) — this is an additive rejection reason on the existing exception UI, not a new screen or a new UI step.

### 6.2 Store-disposition sequence: scan, then batch placement, then one line commit (amended 2026-08-24 — retires the 2026-08-20/21 per-unit loop, restores and refines the 2026-08-10 per-line-batch model)

**History**: 2026-08-10 established "scan first, then a suggested location" scoped to the whole line — scan every unit, get one location suggestion for the whole remaining quantity, one "Store" tap commits the entire line to a single lot/single location. 2026-08-20 narrowed this to a per-individual-physical-unit loop (implemented and real-Postgres-verified 2026-08-21). A separate branch (`fix-it-felix`) then proposed reverting to a batch/whole-line model with explicit multi-location placement, merged 2026-08-24 as a genuine unresolved contradiction (former §9.0). **Product Owner decision, 2026-08-24: the batch model is authoritative; the per-unit loop is retired.** `commitStoreUnit` and the per-unit idempotency-key machinery have been deleted from the codebase; `commitWrrLine` (`lib/actions/receiving.ts`) is the one commit function for both dispositions.

Under the batch model, a `store`-disposition line needs only **one** accepted carton/pallet scan to become eligible for placement — not every unit individually re-scanned. Once eligible, staff place the line's full `expected_qty` in one step: assign every location, then submit one "Store" command that commits the whole line — lot creation, every `lot_location_balances` row, every `inventory_units` row, and every `inventory_transactions` row — atomically.

Sequence for a `store`-disposition line:

```text
scan one carton/pallet barcode from the line
   → matches expected WRR line (§6 reconciliation: right WRR, right item,
     flow-type match §6.1, not over/duplicate-scanned)
   → line becomes eligible for placement (line has >= 1 accepted scan and
     is not yet committed)
   → system computes and displays ALL candidate `storage` locations with
     available remaining CBM capacity for at least one more unit of this
     line's item (§6.2a) using the §10 location/capacity suggestion
     interface
   → staff assigns the line's full expected_qty across one or more
     candidates — a single-location quick action ("put all N boxes in
     [location]") or an explicit per-box/per-location split (§6.2b)
   → if more than one location is used (or the UI's multi-slot assignment
     surface is used at all, per requirements.md R2a item 5), staff
     attests all declared boxes/pallets are physically present
   → staff taps "Store" once for the whole line
   → immediate line commit (§9): creates the lot; creates one
     lot_location_balances row per assigned location; creates one
     inventory_units row per physical box; inserts one
     inventory_transactions row per assigned location
   → visible per-line "committed" success state
```

`wrr_items.putaway_location_id` is written at the line's "Store" step only when the whole line goes to a single location (re-interpreted 2026-08-24, §5.1); it is left unset when the placement splits across more than one location. The commit-time re-validation of every assigned location's state/type (requirements.md R1.4) still applies — the suggestion is a recommendation, not a bypass of that check.

### 6.2a Multiple candidate locations per suggestion, not a single recommendation (amended 2026-08-24, carries forward the 2026-08-20 multi-candidate contract unchanged)

**Generalizes, rather than replaces, §10's existing "location/capacity suggestion interface."** §10 already described the interface's data contract as "remaining CBM vs. candidate `locations`" (plural), and the app's `suggestPutawayLocations` query/UI already returns and renders an array of candidates — this section makes the multi-candidate contract explicit for the batch model, unchanged in substance from the 2026-08-20 wording it carries forward (only the calling grain moved back from per-unit to per-line, per §6.2).

The location suggestion, shown once a `store`-disposition line has its first accepted scan, SHALL list **every** active `storage`-type `location` that currently has available remaining CBM capacity for at least one more unit of the line's item — not narrowed to a single "best" pick. Staff distribute the line's full declared quantity across one or more of the listed candidates (§6.2b), up to each candidate's own computed capacity (its remaining CBM divided by the item's `unit_cbm`, floored).

### 6.2b Quantity split across multiple locations within one line's single commit (amended 2026-08-24, restates the 2026-08-20 multi-location outcome under the batch model)

A `store`-disposition line's declared quantity MAY be assigned across more than one location within its single batch commit — for example, the first several cartons of a 10-carton line to Location A and the remainder to Location B, because A alone cannot fit all 10. This is still one WRR line and one logical lot (`lots.wrr_item_id`, one row) — but its stock sits in more than one `lot_location_balances` row (same `lot_id`, different `location_id` per row), which the existing schema already supports (the `unique(lot_id, location_id)` constraint enforces one row per lot-location *pair*, not one location per lot). **No `01-core-data-model` schema change is required for this**: multiple `lot_location_balances` rows per lot is not new — §7.3 already documents multiple *lots* coexisting at one inspection location; this is the mirror case of one lot's stock spanning multiple locations, using the same table shape. Unlike the retired 2026-08-20 per-unit model (which discovered a split organically as successive per-unit commits exhausted a location's capacity), the batch model's split is explicit and known before the line's single commit: staff assign quantities per location (or per box, grouped into per-location quantities) up front, and the whole assignment posts atomically together. See §9 for the exact commit mechanics and §5.1 for the resulting treatment of `wrr_items.putaway_location_id`.

### 6.3 Inspect-disposition ("Hold") sequence: location first, then scan (added 2026-08-10)

An `inspect`-disposition line is **not** scan-first, and this is not inconsistent with §6.2: the putaway suggestion in §6.2 needs the item's CBM/quantity to check remaining storage capacity, but the `inspection` location is a real, enrolled `locations` record with `location_type = 'inspection'` (§2's table; `01-core-data-model` `locationTypeEnum`) — typically a small, fixed set of locations, not a capacity-suggestion problem. There is no reason to gate confirming the hold location behind a scan.

Sequence for an `inspect`-disposition line:

```text
staff selects/confirms the active inspection location
   → staff scans the item
   → matches expected WRR line (§6 reconciliation, including §6.1's
     flow-type check)
   → staff taps "Hold"
   → immediate per-line commit (§9): quarantined lot, lot_location_balances
     at the inspection location, inventory_transactions row, and the
     inspection case event for `11` (§7.3) — all created for this line
     alone
```

This §6.3 sequence is unaffected by the 2026-08-24 batch-model decision — it describes an entire line whose disposition is already `inspect` before scanning begins (set in the pre-receiving form or by a floor supervisor override, §7.1), and `inspect` lines never split across multiple locations (§6.2b applies to `store` lines only).

### 6.4 Per-unit Hold override on an otherwise store-disposition line — SUPERSEDED 2026-08-24, the mechanism it depended on no longer exists

**Historical context, retained rather than deleted.** A 2026-08-20 Product Owner decision proposed a per-unit "Hold" escape hatch alongside the then-current per-unit "Store" action (former §6.2): each individually scanned unit on a `store`-disposition line would get its own "Hold" button, so one physical unit could be quarantined while the rest of the same line's units proceeded to Store. That proposal was flagged, not resolved — it required a `01-core-data-model` amendment to represent "some units of this line are available, other units of the same line are quarantined," since §7's disposition model assigns exactly one `lots` row with one `status` per WRR line, and no such amendment was ever drafted or approved.

**Now additionally moot under the 2026-08-24 batch-model decision.** The per-unit commit loop this proposal depended on (former §6.2's per-unit "Store" action) has itself been retired in favor of §6.2's whole-line batch commit. There is no per-unit commit event left in this design to attach a per-unit Hold override to — a `store`-disposition line commits once, as a whole, or not at all. The underlying `01-core-data-model` schema gap this section originally described (one `lots.status` per WRR line) is unchanged and still real, but the requirement that would have used it no longer has a home in this design.

If the underlying operational need still matters — excluding part of a line's physical quantity from an otherwise-conforming Store commit, e.g. one visibly damaged box discovered while placing an otherwise-good pallet — it is a **new** requirement against the batch model, not a restatement of this section. requirements.md §5a Item 4 records this as an open, unscheduled question: R5a's existing quantity-splittable `on_hold`/`reject` visual-inspection path may already cover it if resolved *before* the line's single Store commit, but that would require clarifying whether §6.2/R2a's "allocation total must equal `expected_qty`" invariant is measured against the line's original or a post-exclusion quantity. Not decided here.

## 7. Inbound receiving disposition

The disposition model determines the lot status and inventory posting location created for each line at confirmation time. It is a required field on the WRR line, set before confirmation and enforced atomically by the commit transaction.

### 7.1 Disposition decision

The disposition value (`store` or `inspect`) is set on each `wrr_items` line. The default is `store`. The system enforces `inspect` automatically when:

- the item's `is_perishable` flag or an explicit inspection-required item flag is active;
- the `flow_type` or vendor party configuration mandates inspection;
- a supervisor explicitly overrides the disposition to `inspect` before confirmation.

The back-office user sets the initial disposition in the pre-receiving form. The floor supervisor may change it before triggering the confirmation command.

**Note added 2026-08-20, updated 2026-08-24 — see §6.4.** This section's model (one `disposition` value per `wrr_items` line, driving exactly one `lots` row with one `status`) is now accurate for every commit path this document describes, with no outstanding exception: §6.4's proposed per-unit Hold override was itself superseded by the 2026-08-24 retirement of the per-unit commit model it depended on. If a batch-model-shaped successor to that proposal is ever drafted (requirements.md §5a Item 4), this section will need its own follow-up amendment at that time — none is needed now.

### 7.2 Store path (`disposition = 'store'`)

```text
scan confirmed + disposition = store
        │
        ▼
commit transaction:
  lots created:
    lot_number  = wrr_items.lot_number   (single canonical identifier)
    wrr_item_id = wrr_items.id
    status      = 'available'
        │
        ▼
  lot_location_balances at putaway location:
    qty_received  = confirmed_qty
    qty_remaining = confirmed_qty
    qty_committed = 0
        │
        ▼
  inventory_transactions:
    movement_type  = 'receiving'
    to_location_id = putaway location
        │
        ▼
lot immediately eligible for FIFO/FEFO allocation
```

### 7.3 Inspect path (`disposition = 'inspect'`)

```text
scan confirmed + disposition = inspect
        │
        ▼
commit transaction:
  lots created:
    lot_number  = wrr_items.lot_number   (single canonical identifier)
    wrr_item_id = wrr_items.id
    status      = 'quarantined'
        │
        ▼
  lot_location_balances at inspection location:
    qty_received  = confirmed_qty
    qty_remaining = confirmed_qty
    qty_committed = 0
    qty_available (derived) = 0   ← NOT allocatable
        │
        ▼
  inventory_transactions:
    movement_type  = 'receiving'
    to_location_id = inspection location
        │
        ▼
inspection case event emitted → 11-transfer-and-inspection owns resolution
```

The `inspection` location is a distinct enrolled `locations` record with `location_type = 'inspection'`. Multiple quarantined lots coexist at this location; each has its own `lot_location_balances` row (the `unique(lot_id, location_id)` constraint ensures one row per lot-location pair).

### 7.4 Quarantined lot: state while awaiting inspection

While a lot is in `quarantined` status at the inspection location:

- `lot_location_balances.qty_remaining` holds the physical quantity.
- `lot_location_balances.qty_committed = 0`; derived `qty_available = qty_remaining - qty_committed = 0`.
- The lot is excluded from all FIFO/FEFO allocation queries. The eligibility gate is `lots.status = 'available'` (see `01-core-data-model` §3, workflow 3); a quarantined lot never satisfies this gate.
- The lot appears in inspection queues and inventory reporting but is clearly marked non-available.
- No pick-list or commitment may be created against this lot until `11` transitions it to `available`.

### 7.5 Resolution paths (owned by `11-transfer-and-inspection`)

All post-quarantine state transitions are owned by `11`. The `07` commit emits the inspection case event; it does not implement or duplicate resolution logic.

| Inspection result | Action | Resulting lot state |
| --- | --- | --- |
| Pass | `lots.status` → `available`; `lot_location_balances` updated or transferred to putaway location; `inventory_transactions` with `movement_type = 'transfer'` from inspection to putaway. | `available` at putaway location |
| Fail — return to party | Return-to-party process; `lots.status` → `depleted`; inventory transaction records the return quantity. | `depleted` |
| Fail — hold | Lot remains `quarantined`; held pending further review or escalation. | `quarantined` (held) |
| Fail — write-off | Write-off process; `lots.status` → `depleted`; inventory transaction records the write-off quantity. | `depleted` |

**State diagram:**

```text
             quarantined
                  │
      ┌───────────┼────────────────────┐
      ▼           ▼                    ▼
[inspection    [fail: hold]     [fail: return /
    pass]                         write-off]
      │           │                    │
      ▼           ▼                    ▼
  available   quarantined           depleted
  (transferred  (held, pending     (returned to
  to putaway)    review)            party or
                                   written off)
```

## 8. Inbound inspection design

Inbound physical inspection is recorded during the `receiving_in_progress` phase, before confirmation. It captures conformance/non-conformance for physical issues found at arrival (wrong items, damaged cartons, quantity mismatches, paperwork failures).

This is distinct from the post-commit quarantine resolution described in §7.5:

- `wrr_inspection_logs` records the physical conformance observation during receiving.
- The `disposition` field determines where the committed lot is posted at confirmation time.
- Post-commit inspection of a quarantined lot is owned by `11`.

Inspection observations during receiving:

- Conformance allows the related line to proceed to confirmation.
- Non-conformance (`actionTaken = 'quarantined'`) indicates the goods need post-commit inspection; the line should carry `disposition = 'inspect'`.
- Non-conformance (`actionTaken = 'returned_to_vendor'`) means the goods are rejected outright and SHALL NOT be committed as inventory.
- Non-conformance (`actionTaken = 'accepted_with_variance'`) allows commit with noted variance; disposition may be `store` or `inspect` depending on the nature of the variance.

Evidence uses private Supabase Storage and inherits WRR/party scope. Automated email alerts, if required, are emitted from the committed server/domain event through `04` and do not determine whether inventory was posted.

`11-transfer-and-inspection` may later define transfer-specific inspection state; it must not reuse inbound WRR conformance statuses or silently change receiving commit rules.

## 9. Receipt commit and idempotency

**Reversed 2026-08-10, re-affirmed 2026-08-24 (retires the 2026-08-20/21 per-unit re-scoping that sat between these two dates): per-line immediate commit, not a single end-of-WRR atomic gate, and not a per-unit commit loop either.** Each WRR line commits as its own atomic step, once, immediately when staff tap "Store" (§6.2, `store` lines, possibly split across multiple locations within that one commit) or "Hold" (§6.3, `inspect` lines). This generalizes a pattern already accepted elsewhere in this spec set rather than inventing new architecture: the 2026-08-09 "Eight cross-spec PO decisions" WRR-cancellation resolution (revision-log.md) already establishes that a WRR can reach a state where some lines are committed/posted to inventory while others are not.

**History note (2026-08-20 → 2026-08-24).** Between these dates, this section briefly described a finer-grained per-unit commit loop — the atomic step being one physical unit rather than one line — implemented as `commitStoreUnit`/`commitInspectLine` and real-Postgres-verified 2026-08-21. A separate branch (`fix-it-felix`) proposed a batch/whole-line commit model instead; the two were merged 2026-08-24 as a genuine unresolved contradiction (former §9.0). **Product Owner decision, 2026-08-24: the batch/whole-line model below is authoritative; the per-unit model is retired and has been deleted from the codebase** — `commitStoreUnit`, `commitInspectLine`, and the per-unit idempotency-key mechanism no longer exist. `commitWrrLine` (`lib/actions/receiving.ts`) is the one commit function for both dispositions. `08-outgoing-withdrawal-and-two-stage-commitment` requirements.md R3.3's exact-box dispatch-scan guarantee, which the per-unit model was originally checked against, is preserved under the batch model because `inventory_units` (step 8 below) is still populated from each physical box's actually-assigned location at the line's single commit, using a deterministically derived identity rather than an unverified freehand slot number — see step 8.

### Line commit command — the current, authoritative sequence

Each line's commit receives the WRR ID, the specific `wrr_items.id`, the resolved disposition (`store`/`inspect`), and the line's placement — either a single `location_id` (the whole line to one place) or a batch placement (`allocations`: explicit per-location quantities, or `unit_location_ids`: one location per physical box, index-aligned with the line's `expected_qty`, which the server derives into per-location `allocations` by grouping) plus a presence attestation whenever more than one physical box's placement is being asserted in the same commit. Within one transaction, for that line alone, it:

1. verifies the line is still in a commit-eligible state (`wrr_documents.status = 'receiving_in_progress'`, this line not already committed — the idempotency check described below);
2. verifies the line's active item/party references, flow partition, and required lot metadata (a resolved `itemId`, a set disposition);
3. resolves the requested placement — a single `location_id`, or a batch placement derived from `allocations`/`unit_location_ids`. A batch placement requires the presence attestation. Either shape's assigned total SHALL equal the line's `expected_qty` exactly, or the commit is rejected before anything is posted;
4. verifies every assigned location's active/type state (`storage` for `store`, `inspection` for `inspect`) and current available remaining CBM capacity for its assigned quantity — capacity is re-checked at commit time, not assumed from the suggestion shown a moment earlier;
5. creates the `lots` row: `lot_number` copied from `wrr_items.lot_number` (the single canonical identifier), `wrr_item_id` set, `status = 'available'` for `store` or `status = 'quarantined'` for `inspect`;
6. for `store`-disposition placements, inserts one `wrr_item_putaway_allocations` row per assigned location (`lib/db/schema/wrr.ts`, migration `0032_wrr_item_putaway_allocations.sql`) — a staged/audit record of the placement, not itself a stock table;
7. inserts one `lot_location_balances` row per assigned location, with that location's assigned quantity as both `qty_received` and `qty_remaining`, `qty_committed = 0`;
8. inserts one `inventory_units` row (`lib/db/schema/inventory_units.ts`) per physical box, keyed to a stable, reprint-safe identity derived from `(wrr_item_id, box_index)` (`deriveWrrUnitId`, `lib/barcode/wrr-unit.ts`) and that box's assigned `location_id`, with `status = 'available'` for `store` or `status = 'quarantined'` for `inspect`. This is what `08` requirements.md R3.3's exact-box dispatch scan matches against; because the identity is derived deterministically rather than freehand-numbered, reprinting a label never creates a new box identity;
9. for `store` disposition, sets `wrr_items.putaway_location_id` to the single assigned location when the whole line went to one place (§5.1), and leaves it unset when the placement split across more than one location;
10. inserts one immutable `inventory_transactions` row per assigned location, each with `movement_type = 'receiving'` and `to_location_id` set to that allocation's location;
11. for `inspect` disposition, additionally emits an inspection case event for `11` (open case, linked to the lot and WRR line);
12. marks the line's terminal committed state (`wrr_items.committed_at`) and re-evaluates the parent WRR's aggregate completion state, updating `wrr_documents.status` accordingly (see the `wrr_status` note below);
13. records audit/correlation data according to the approved cross-cutting design.

The `lot_location_balances` rows created by each commit are the authoritative source for `lot_inventory_totals`. No other balance ledger or aggregate table is created or maintained by this feature.

**Idempotency (re-affirmed 2026-08-24, retires the 2026-08-20 per-unit-scoped mechanism).** `wrr_items.committed_at` is both the line's terminal-state marker and its idempotency gate: a conditional `UPDATE ... WHERE committed_at IS NULL` claims the right to post this line's inventory rows — exactly as it did before the 2026-08-20 per-unit re-scoping temporarily split those two roles apart into a line-level terminal marker plus a separate per-unit idempotency-key mechanism (§4). A retried or duplicate commit request for an already-committed line observes the prior successful result rather than re-posting inventory. The existing `BEFORE UPDATE` trigger protection (`wrr_items_protect_committed_at`, migration `0022_receiving_inventory_insert_policies.sql`) is unaffected — it still only ever transitions `NULL → non-NULL` once.

A failed line commit rolls back completely for that line only; it remains in its pre-commit scanned/pending state and the result is a safe, recoverable error. A failure on one line has no effect on any other line's already-committed state.

**Resolved 2026-08-10, re-affirmed 2026-08-24 (Product Owner decision)**: `wrr_status` stays as-is — `staged_pending_arrival`, `receiving_in_progress`, `confirmed`, `cancelled`. No new enum value is added. `receiving_in_progress` covers the entire window from the first line committing through the last, whether 0 or N-1 of N lines are done; which lines are committed and which are pending is tracked at the `wrr_items` row level (§5.2's scan-line state), not on the parent WRR status. `wrr_documents.status` transitions to `confirmed` only once every line on the WRR has reached a terminal committed state. (The brief 2026-08-20/21 per-unit re-scoping applied this same reasoning one level down, to units within a line; that finer-grained window no longer exists now that the per-unit model is retired, so this resolution reverts to its original, simpler 2026-08-10 form.)

This also corrects a stale reference: the 2026-08-09 cancellation-resolution entry in `revision-log.md` described a cancelled-with-some-lines-committed WRR as closing with "`partial` status" — that value was never actually added to the schema, and per this decision it never will be. A cancelled WRR with some lines already committed closes with `wrr_status = 'cancelled'`; the already-committed lines' `lots`/`lot_location_balances`/`inventory_transactions` rows stand as posted (nothing about those rows is undone by cancellation). "Partial" describes the *outcome* in prose, not a distinct status value. See `revision-log.md`'s 2026-08-10 entry for the correction.

**Added 2026-08-10 (rbac-rls-reviewer gap fix, `0022_receiving_inventory_insert_policies.sql`), unaffected by the 2026-08-24 batch-model decision**: two contained gaps in the line commit path's DB-layer protection are closed. (1) `lots`, `lot_location_balances`, and `inventory_transactions` previously had SELECT-only RLS policies and grants — `commitWrrLine`'s inserts into all three were relying on no enforced INSERT policy at all. INSERT policies gated on `receiving.confirm` (and, for `inventory_transactions` only, also `dispatch.execute`, since `dispatchPickList` in `08` also inserts there) plus matching narrow `GRANT INSERT` are added; `wrr_item_putaway_allocations` (migration `0032`) carries its own equivalent INSERT policy gated on `receiving.confirm`. (2) `wrr_items.committed_at` (this section's idempotency gate) had no protection against being reset from a timestamp back to `NULL` by a later UPDATE — a `BEFORE UPDATE` trigger (`wrr_items_protect_committed_at`) now rejects any attempt to change `committed_at` once it is non-NULL, closing the double-post risk without adding a `WITH CHECK` clause to `wrr_items_update` (which deliberately has none, per its own comment in `0012_receiving_disposition_and_policies.sql`).

## 10. Putaway and incoming ledger

Receiving consumes the approved location/capacity suggestion interface. It may display remaining CBM and candidate `locations`, but it does not create a second capacity calculation or own location enrollment. Putaway recommendations apply only to lots committed with `store` disposition; quarantined lots at the `inspection` location are handed off to `11` for resolution before any putaway recommendation applies.

**Timing reversed 2026-08-10**: this same suggestion interface is now invoked at pre-store time (§6.2), not only as a post-commit recommendation — the sequence is scan → suggested location(s) → assign placement → "Store" → line commit (§9), rather than commit first and recommend putaway afterward. This is a change in *when* the existing interface is called, not a new interface or a new capacity calculation; nothing in this section's data contract (remaining CBM vs. candidate `locations`) changes.

**Granularity, re-affirmed 2026-08-24 (retires the 2026-08-20 per-unit call frequency)**: the interface is called once per line, after that line's first accepted scan (§6.2) — not once per individually scanned unit, which was a 2026-08-20/21 amendment now retired along with the per-unit commit loop it supported. Its contract remains as clarified in that amendment and carried forward here: it returns every currently-eligible candidate location with capacity for at least one more unit (§6.2a), not a single narrowed suggestion, so staff can distribute the line's full declared quantity across one or more of them.

The Incoming Ledger is a server-side query/view over `inventory_transactions` filtered by `movement_type IN ('receiving', 'putaway')`, joined through approved relationships for WRR, item, lot, party, user, and location display. It is read-only and scope-filtered. Historical corrections are new domain transactions, never ledger edits.

**Reached via `/receiving`, not a separate route (updated 2026-08-09).** The Incoming Ledger is the "Ledger" tab on `receiving/page.tsx` (`?tab=ledger`), confirmed-only with no status filter shown, alongside the default "Work Queue" tab (all statuses, filterable) that was already `receiving/page.tsx`'s existing content. There is no standalone `/incoming-ledger` route — see §3's route block.

The WRR queue status selector submits its server-query form immediately on selection. The selected status remains encoded in the URL for refresh, sharing, pagination, and authorized server-side filtering; there is no separate visible Apply control or redundant page-header Filter action.

**Column list (added 2026-08-08)**, following the same field set and "Reference" column convention already established for `01-core-data-model`'s `location_transaction_ledger`/`party_transaction_ledger` (design.md §3 item 4), so all of this project's transaction-ledger surfaces read consistently:

| Column | Source |
| --- | --- |
| Date/time | `inventory_transactions.created_at` |
| Transaction # | `inventory_transactions.transaction_number` |
| Movement type | `inventory_transactions.movement_type` (`receiving` \| `putaway`) |
| Item | `items.code` / `items.name` via `inventory_transactions.item_id` |
| Lot number | `lots.lot_number` via `inventory_transactions.lot_id` |
| Qty | `inventory_transactions.qty` |
| To location | `locations.label` via `inventory_transactions.to_location_id` (the putaway or inspection location) |
| WRR # | `wrr_documents.wrr_number` via `inventory_transactions.wrr_id` |
| Vendor party | `parties.name`/`code` via `wrr_documents.vendor_party_id` |
| Performed by | `performed_by_user_id` resolved to display name |
| Reference | `inventory_transactions.commercial_invoice_no` |

`from_location_id` is not shown — incoming movements originate outside the warehouse (no source location), so this column is intentionally omitted rather than displayed empty. Flow type (`inventory_transactions.flow_type`) is available for filtering (VMI/Trading/Supplies) but not a default visible column, consistent with the collapsed-row density this table targets.

## 11. Offline, realtime, and infrastructure boundaries

- Only scan/reconciliation capture may be proposed for Tier 1 offline support, and each operation needs an explicit policy from this spec plus `03`.
- WRR creation/edit, CIPL upload, unknown item enrollment, inspection resolution, receipt confirmation, and putaway confirmation are Tier 2/online-only in v1. This is the complete list — no other receiving mutations are candidates for Tier 1 offline. **Re-affirmed 2026-08-24, retires the 2026-08-20 per-unit framing**: "receipt confirmation" here covers each line's single "Store"/"Hold" commit event (§6.2/§6.3/§9), which is a Tier 2/online-only action, same as it was before the brief 2026-08-20/21 per-unit re-scoping (which described the same rule at unit frequency instead of line frequency — that finer grain no longer applies). Scanning/reconciling a carton (recording that it was seen) remains the only Tier 1 candidate; the location suggestion display and the "Store"/"Hold" commit tap itself both require an online round trip, same as the location-suggestion/commit step always has.
- On replay, the server re-authenticates and rechecks WRR status, current capability/scope, item/party state, quantity, disposition values, and idempotency. Offline data cannot create inventory directly.
- Realtime may invalidate a WRR list/attention state; authoritative refetch is required.
- CIPL/evidence files use private Storage and signed/session-authorized access.
- Sentry/monitoring receives redacted correlation/error data only.

## 12. Design verification before approval

- [x] Reconcile WRR status, line, inspection, lot, and ledger columns with approved `01-core-data-model`; confirmed from approved schema — all field names, types, and relationships verified. The `disposition` field on `wrr_items` is the only net-new field identified; a `01` schema amendment is required before implementation.
- [x] Confirm whether `wrr_inspection_logs` is retained as the inbound inspection record and define its final resolution fields — confirmed retained; `conformance_status`, `non_conformance_reason`, `remarks`, `evidence_photo_url`, and `action_taken` are confirmed from the approved schema.
- [ ] Confirm receipt commit and RLS policy matrix with `02-rbac-roles`.
- [ ] Confirm the exact Tier 1 scan command and rejection behavior with `03-offline-mode-and-client-storage`.
- [ ] Confirm Auth, Storage, email, idempotency, and server transaction boundaries with `04-services-and-infrastructure`.
- [ ] Confirm floor/office routes and feedback contracts with `05-ui-shell-and-navigation`.
- [ ] Confirm unknown item recovery with `06-party-and-item-enrollment`.
- [ ] Confirm inspection case event contract and resolution state transitions with `11-transfer-and-inspection`.
- [ ] Have `offline-sync-reviewer`, `rbac-rls-reviewer`, and `design-system-auditor` review before approval.
- [x] **Added 2026-08-06, resolved 2026-08-06**: `01-core-data-model`'s `wrr_advance_notices` schema amendment (design.md §6) has passed three real-Postgres `db-migration-verifier` passes (schema, full RLS policy, remaining test scenarios — all PASS), and `02-rbac-roles`'s `shipment_labels.generate`/`wrr_advance_notices` RLS pattern (design.md §3.2/§7.4/§7.4a) has been through two `rbac-rls-reviewer` rounds with every finding closed and confirmed (see `revision-log.md`'s 2026-08-06 entries). This closes the specific gate this checkbox named — it does not by itself constitute `01`'s or `02`'s own approval process reopening (both remain `Approved` for their prior content), and it does not cover `07`'s own new §5.5/§6 additions, which are a separate, narrower `rbac-rls-reviewer` pass (in progress).
- [ ] **Added 2026-08-10, not yet resolved, scope updated 2026-08-24, `commit-validation.ts` defect fixed 2026-08-24 (see note below)**: the per-line-immediate-commit / scan-then-suggest-location design (§4, §5.1, §6.1–§6.3, §9, §10) has not been through `db-migration-verifier` or `rbac-rls-reviewer` in its current (batch, 2026-08-24) form. This checkbox stays open until `lib/receiving/wrr-schema.ts`, `lib/receiving/scan-matcher.ts`, `lib/receiving/commit-validation.ts` (now reconciled to the batch model, code-side — see the note below), `lib/actions/receiving.ts`, and the floor UI (`app/(authenticated)/receiving/[wrrId]/receive/page.tsx`, `PutawayLocationSelector.tsx`) go through the actual `db-migration-verifier`/`rbac-rls-reviewer` passes named above, which have not happened yet.
- [x] **Added 2026-08-10, resolved 2026-08-10, re-affirmed 2026-08-24**: `wrr_status` needs no new value for the per-line-commit normal path — Product Owner decided `receiving_in_progress` already covers "some lines posted, not yet all," since per-line completion is tracked on `wrr_items`, not the parent WRR status. See §9's resolution and `revision-log.md`'s 2026-08-10 entry, which also corrects the 2026-08-09 cancellation entry's stale "`partial` status" wording (no such enum value exists or will be added; a cancelled-with-partial-completion WRR closes as `cancelled`).
- [x] **Added 2026-08-20, RESOLVED 2026-08-24 — moot, not by `01`'s process but by retirement of the mechanism it depended on**: §6.4's per-unit Hold override on an otherwise `store`-disposition line is superseded — the per-unit commit loop it would have attached to no longer exists. `01-core-data-model` is not being asked to resolve the underlying lot/status representation question at this time; if a batch-model-shaped successor is ever drafted (requirements.md §5a Item 4), it will need its own verification pass then.
- [x] **Added 2026-08-20, RESOLVED 2026-08-24**: the per-unit scan-suggest-commit loop, its multi-candidate location list, and its multi-location split are retired along with the rest of the per-unit model (§6.2–§6.2b now describe the batch model instead). The multi-candidate location list and multi-location split concepts carry forward into the batch model unchanged in substance — see the checkbox above for the batch model's own outstanding verification gate.
- [x] **Added 2026-08-24 (merge reconciliation), RESOLVED 2026-08-24 (Product Owner decision)**: the batch putaway allocation model (formerly §9.0) is authoritative; the per-unit scan-suggest-commit model is retired. `08-outgoing-withdrawal-and-two-stage-commitment` requirements.md R3.3's exact-box dispatch-scan guarantee is preserved because `inventory_units` is still populated from each physical box's actually-assigned location at the line's single commit (§9 step 8), using a deterministically derived identity, not an unverified freehand slot number. See `specs/00-steering/revision-log.md`'s 2026-08-24 entry for the full account.
- [x] **Added 2026-08-24, RESOLVED same day (code fix)**: `lib/receiving/commit-validation.ts`'s `validateLineCommit` and its test file had encoded the retired per-unit model's scan-completeness gate for `store` lines (rejecting a commit whenever `scannedQty >= expectedQty`), which `commitWrrLine`'s batch path (forcing `scannedQty = expectedQty`) would have always failed as "already fully committed." Root cause: `fix-it-felix` never touched this file, so git's clean auto-merge silently kept `v1`'s stale per-unit version. Fixed by replacing both files wholesale with `fix-it-felix`'s already-batch-compatible versions. `npx tsc --noEmit` and the full `npx vitest run` (1894 tests) are clean. Real-Postgres re-verification of this path remains open — see `revision-log.md`'s 2026-08-24 entry and the checkbox above.
