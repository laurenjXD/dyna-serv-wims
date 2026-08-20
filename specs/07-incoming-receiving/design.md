# Incoming Receiving — Design

Status: Approved
Updated: 2026-08-20

## 1. Design intent

Incoming Receiving is a two-surface workflow:

1. An office-oriented pre-receiving surface encodes and prints a WRR from an external CIPL/packing-list reference.
2. A floor-oriented receiving surface reconciles physical carton scans and inbound inspection results, then submits one authoritative receipt commit.

The design preserves the boundary between expectation and inventory: `wrr_documents`/`wrr_items` describe expected inbound goods; active lots and `inventory_transactions` are created only by the authorized commit transaction. The commit creates one of two inbound posting paths — `store` (available at putaway) or `inspect` (quarantined at inspection location) — based on the per-line disposition field set before confirmation.

## 2. Foundational dependencies and core tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, `brand-design-system.md`, and `revision-log.md`.
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
| `lot_location_balances` | Created at commit for each confirmed line: putaway location row for `store`, inspection location row for `inspect`. These rows are the authoritative source for `lot_inventory_totals`. | Core schema owns fields and constraints; receiving inserts via the commit transaction. |
| `wrr_documents` | Store staged WRR header and lifecycle. | Core schema owns fields/status constraints; receiving owns workflow commands. |
| `wrr_items` | Store expected lines, scan reconciliation state, and per-line disposition. | Core schema owns fields; receiving owns matching behavior. The `disposition` field (`store`/`inspect`) is a new field to be added to `01` via schema amendment. |
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
Level 1 cards, table, hover states — per `brand-design-system.md` §3's rule
that tabs are an office pattern; the floor-oriented scan/reconciliation
route (`[wrrId]/receive/page.tsx`) is unaffected and remains a
single-column, one-primary-action floor screen.

Route names and capability references remain provisional until `05`, `02`, and the feature route inventory are approved.

- Office routes use the shared office shell and page-header/list/form contracts.
- The floor receive route opts into the floor surface: 16px padding, solid surfaces, scanner-ready input, no dense table, no persistent sidebar during active scanning, and one primary action.
- The print route uses the brand system as the source of truth for generated documents and is not a second editable WRR form.
- Feature content owns scan feedback, remaining-quantity cards, inspection choices, disposition display, and receipt confirmation. The shell owns global session/navigation/status boundaries.

## 4. State model and command boundaries

**Updated 2026-08-10, further amended 2026-08-20**: the diagram below reflects per-unit immediate commit (§9), replacing the earlier single end-of-WRR "confirm receipt command" gate. **2026-08-20**: what commits independently is now each individual scanned physical unit, not the whole line at once (§6.2) — a `store`-disposition line's units may commit to more than one location (§6.2b). The WRR only reaches `confirmed` once every line's every expected unit has reached a terminal commit outcome.

```text
Create WRR → staged_pending_arrival
                  │ print/review
                  ▼
          start receiving command
                  ▼
         receiving_in_progress
          ├── scan/reconcile (per unit, §6)
          ├── per-unit "Store" commit → lots (available, created on first
          │     unit / reused thereafter) + lot_location_balances (putaway,
          │     possibly split across >1 location, §6.2b) +
          │     inventory_transactions (§9) — one commit per physical unit
          ├── per-unit "Hold" commit (inspect-disposition line, whole line,
          │     §6.3) → lots (quarantined) + lot_location_balances
          │     (inspection) + inventory_transactions + inspection case
          │     event for 11 (§9)
          ├── per-unit "Hold" override on an otherwise store-disposition
          │     line (§6.4) — UNRESOLVED, pending `01-core-data-model`,
          │     not implementable as drawn until that gap closes
          └── exception resolution
                  │ every line's every expected unit reaches a terminal
                  │ commit outcome (or the line is discarded/cancelled) —
                  │ `receiving_in_progress` covers this whole window,
                  │ whether 0 or N-1 of N units across N lines are
                  │ committed (resolved 2026-08-10, §9; re-scoped to the
                  │ unit as the atomic step 2026-08-20)
                  ▼
               confirmed
          └── putaway suggestion shown at every unit scan (§6.2, §6.2a, §10)
```

Every mutation is a server action/route-handler command with this sequence:

```text
session → capability/scope → input/schema → current WRR state
       → domain checks → idempotency key → database transaction
       → safe result + revalidation
```

No client command directly updates `lots`, `lot_location_balances`, or `inventory_transactions`. **Amended 2026-08-20**: each per-unit "Store"/"Hold" command owns its own database transaction that checks that unit's prerequisites, writes the resulting domain records for that single physical unit, and records the immutable ledger outcome for that unit. If a unit's transaction fails, that unit remains in a safe prior (scanned-not-committed) state; every other unit's already-committed state — on the same line or any other line — is unaffected. A line is considered fully committed once every one of its `expected_qty` units has reached a terminal commit outcome (§9).

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
| Putaway location | `wrr_items.putaway_location_id` | **Reversed 2026-08-10 (supersedes the 2026-08-09 Product Owner decision — see `specs/00-steering/revision-log.md`).** No longer required, set, or even meaningfully choosable at WRR-creation time — at staging time the system does not yet know what will actually be scanned, so a location cannot be suggested against real item CBM/capacity data. The column (already nullable in `01`'s schema; no migration proposed by this amendment) is now populated per line at scan/store time, per §6. `store`-disposition lines carry `putaway_location_id = NULL` from WRR creation through the start of receiving. **Re-interpreted 2026-08-20**: now that a line's units may commit to more than one location (§6.2b), this single column can no longer represent "the" putaway location for a line whenever a split occurs. No `01` schema change is made or required for this — the column is re-scoped to record the most-recently-used putaway location for the line (a display/UX convenience, e.g. "last used" for the next unit's default suggestion), not the authoritative location record. The authoritative, complete record of which quantities sit at which location for a given lot is always `lot_location_balances` (§9), never this column, whether or not a line has split. |

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

### 6.2 Store-disposition sequence: per-unit scan-suggest-commit loop (amended 2026-08-20 — supersedes the per-line-batch model of 2026-08-10)

**2026-08-10 established** "scan first, then a suggested location" as the sequence, but scoped it to the whole line: staff scanned every unit expected on the line first, the system then suggested one location for the line's full remaining quantity, and one "Store" tap committed the entire line as a single lot at a single location (see `specs/00-steering/revision-log.md`'s 2026-08-10 entry for that decision in full — it reversed a still-earlier 2026-08-09 pre-scan-location decision, which remains superseded).

**Product Owner decision, 2026-08-20**: this is amended again — not reversed, narrowed to a finer grain. The scan-suggest-commit loop now runs **per individual physical unit**, not per line-batch. For each unit scanned on a `store`-disposition line: the system immediately shows the candidate storage location(s) for that one unit, staff picks one, and that single unit commits immediately — with a visible "committed" success state — before the next unit is scanned. This repeats until the line's `expected_qty` is fully accounted for (every unit has reached a terminal commit outcome, whether Store or the escape hatch in §6.4). Nothing about the underlying "approved location/capacity suggestion interface" (§10) is replaced — the same interface is now called once per unit instead of once per line, and (§6.2a) returns every eligible candidate rather than a single narrowed pick.

Sequence for one physical unit on a `store`-disposition line:

```text
scan one unit's barcode
   → matches expected WRR line (§6 reconciliation: right WRR, right item,
     flow-type match §6.1, not over/duplicate-scanned)
   → system computes and displays ALL candidate locations with available
     remaining CBM capacity for this one unit (§6.2a) using the §10
     location/capacity suggestion interface
   → staff picks one candidate (or overrides with another active
     `storage` location, subject to the same capacity re-check)
   → staff taps "Store" for this unit alone
   → immediate per-unit commit (§9): on this line's first committed unit,
     creates the lot; on every committed unit, creates or increments the
     matching lot_location_balances row at the chosen location and inserts
     one inventory_transactions row for this unit
   → visible per-unit "committed" success state
   → next unit is scanned (repeat until expected_qty units are all
     terminal)
```

`wrr_items.putaway_location_id` continues to be written at each unit's "Store" step (re-interpreted 2026-08-20, §5.1, as a display convenience once a line splits across locations — not the authoritative record). The confirmation-time re-validation of location state/type (requirements.md R1.4) still applies per unit — the suggestion is a recommendation, not a bypass of that check.

### 6.2a Multiple candidate locations per suggestion, not a single recommendation (amended 2026-08-20)

**Generalizes, rather than replaces, §10's existing "location/capacity suggestion interface."** §10 already described the interface's data contract as "remaining CBM vs. candidate `locations`" (plural) and the app's existing `suggestPutawayLocations` query/UI already returns and renders an array of candidates at the line-batch level — this amendment does not invent a new capability, it makes the multi-candidate contract mandatory and moves its use to per-unit granularity (§6.2).

Every unit's location suggestion SHALL list **every** active `storage`-type `location` that currently has available remaining CBM capacity for that one unit — not narrowed to a single "best" pick. Staff select which of the listed candidates to use for that unit. As units of the same line commit, a location's available capacity is re-derived from `lot_location_balances`/location capacity data (§10); once a location's remaining capacity is exhausted, it naturally drops out of the candidate list for the line's next unit, without any special-cased "location full" logic beyond the existing capacity comparison.

### 6.2b Units split across multiple locations within one line (added 2026-08-20)

A direct consequence of §6.2/§6.2a: because each unit is suggested-and-committed independently, and the candidate list is re-derived after every commit, different units of the same line MAY commit to different locations. Example: the first several cartons of a 10-carton line go to Location A; once A's remaining capacity is exhausted mid-line, A no longer appears in the candidate list, and the remaining cartons go to Location B. This is still one WRR line and one logical lot (`lots.wrr_item_id` unchanged, one row) — but its stock now sits in more than one `lot_location_balances` row (same `lot_id`, different `location_id` per row), which the existing schema already supports (the `unique(lot_id, location_id)` constraint enforces one row per lot-location *pair*, not one location per lot). **No `01-core-data-model` schema change is required for this**: multiple `lot_location_balances` rows per lot is not new — §7.3 already documents multiple *lots* coexisting at one inspection location; this is the mirror case of one lot's stock spanning multiple locations, using the same table shape. See §9 for the exact per-unit commit mechanics (create-lot-once vs. reuse, insert-vs-increment per `lot_location_balances` row) and §5.1 for the resulting re-interpretation of `wrr_items.putaway_location_id`.

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

This §6.3 sequence is unchanged by the 2026-08-20 amendment — it describes an entire line whose disposition is already `inspect` before scanning begins (set in the pre-receiving form or by a floor supervisor override, §7.1), not a per-unit action on an otherwise `store`-disposition line. A distinct, narrower per-unit Hold action on a `store`-disposition line is a new, separate concept — see §6.4, which is an explicit open item, not yet resolved.

### 6.4 Per-unit Hold override on an otherwise store-disposition line — UNRESOLVED, not implementable as drawn (added 2026-08-20)

**Product Owner decision, 2026-08-20**: alongside the per-unit "Store" action (§6.2), each individual scanned unit on a `store`-disposition line SHALL also have its own "Hold" button as an escape hatch — so a single physical unit can be quarantined even while the rest of the units on the *same line* proceed to Store. This is deliberately finer-grained than §6.3's existing whole-line Hold sequence: the line's `disposition` stays `store`, but one unit within it is pulled aside.

**This conflicts with the current schema and is flagged, not silently resolved.** §7's disposition model assigns exactly one `lots` row per WRR line with a single `status` field (`available` for `store`, `quarantined` for `inspect` — §7.2, §7.3). There is currently no way to represent "some units of this line are stored (available), other units of the same line are held (quarantined)" — lot status lives at the lot-row level, not per unit or per `lot_location_balances` row. Unlike §6.2b's multi-location split (which only adds more `lot_location_balances` rows per lot — already supported), a per-unit status split has no existing schema seam to build on.

**This is `01-core-data-model`'s own amendment/approval process to resolve, not decided here** — in the same spirit as the still-open `wrr_status` item this spec previously flagged rather than resolved unilaterally (see the 2026-08-10 revision-log entry and this spec's now-resolved §9 note; that item was ultimately closed by `01`-adjacent Product Owner decision, and this one needs the same treatment before it can be implemented). Realistic candidate resolutions, described neutrally, not chosen:

- **(a) Split into two `lots` rows sharing one business `lot_number`, differentiated by disposition/status.** E.g. a `store`-disposition line whose units split ends up with an `available` lot row for the stored units and a separate `quarantined` lot row (still carrying the same `wrr_items.lot_number`) for the held unit(s). `lots` has no uniqueness constraint on `lot_number` today (confirmed by reading the approved `01-core-data-model` schema directly — `lots.lotNumber` is `NOT NULL` but not `UNIQUE`, and `lots.wrrItemId` is `NOT NULL` but also not unique, so nothing at the constraint level currently blocks two `lots` rows referencing the same `wrr_item_id`). That absence of a constraint is not the same as `01` having reviewed and endorsed two-lots-per-line as an intended pattern — every other part of this design's narrative (§7.2, §7.3, §9) currently describes "the lot" for a line in the singular, and downstream consumers (`master_inventory_tracking`, `lot_history_export`, FIFO/FEFO allocation, `11`'s quarantine-resolution ownership) have only ever been specified against a one-lot-per-line assumption. `01` needs to explicitly bless (or reject) this pattern, not have it inferred from an absent constraint.
- **(b) Move `status`/quarantine tracking to a finer grain than the lot row** (e.g., onto `lot_location_balances`, or a new per-unit/per-quantity record), leaving `lots.status` as a single row's status but changing what determines FIFO/FEFO eligibility and quarantine-queue membership. This is a larger structural change than (a) — `01-core-data-model` design.md explicitly states "`lots.status = 'available'` is the sole eligibility gate" for FIFO/FEFO (§3, workflow 3) and "no per-feature exclusion logic" (`00-steering/tech.md`'s cross-cutting principles) — moving the eligibility gate off the lot row would be a cross-cutting architectural change, not a `07`-local one.

Neither option is chosen here. **Points 1–3 of this 2026-08-20 amendment (§6.2, §6.2a, §6.2b — the per-unit loop, multi-candidate list, and multi-location split) do not depend on this resolution and can be spec'd and implemented independently**: they only add more `lot_location_balances` rows per lot, which the existing schema already permits. **Point 4 (this section) is blocked on `01-core-data-model`'s amendment/approval process** and MUST NOT be implemented until that process resolves it — see §12's new unresolved checkbox.

## 7. Inbound receiving disposition

The disposition model determines the lot status and inventory posting location created for each line at confirmation time. It is a required field on the WRR line, set before confirmation and enforced atomically by the commit transaction.

### 7.1 Disposition decision

The disposition value (`store` or `inspect`) is set on each `wrr_items` line. The default is `store`. The system enforces `inspect` automatically when:

- the item's `is_perishable` flag or an explicit inspection-required item flag is active;
- the `flow_type` or vendor party configuration mandates inspection;
- a supervisor explicitly overrides the disposition to `inspect` before confirmation.

The back-office user sets the initial disposition in the pre-receiving form. The floor supervisor may change it before triggering the confirmation command.

**Note added 2026-08-20 — not resolved here, see §6.4.** This section's model (one `disposition` value per `wrr_items` line, driving exactly one `lots` row with one `status`) is currently accurate for every commit path this document describes **except** §6.4's proposed per-unit Hold override on an otherwise `store`-disposition line, which is explicitly flagged there as unimplementable under this model as written. This section is deliberately left as-is rather than silently rewritten to accommodate §6.4 — the disposition model stays exactly what it says here unless and until `01-core-data-model` resolves §6.4's open item, at which point this section will need its own follow-up amendment.

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

**Reversed 2026-08-10: per-line immediate commit, not a single end-of-WRR atomic gate.** The prior model — one commit command validating and posting every line of a WRR in a single transaction, gated on all lines being fully scanned/resolved first — was replaced by a per-line commit: each line committed as its own atomic step, immediately when staff tapped "Store" (§6.2, `store` lines) or "Hold" (§6.3, `inspect` lines). This generalized a pattern already accepted elsewhere in this spec set rather than inventing new architecture: the 2026-08-09 "Eight cross-spec PO decisions" WRR-cancellation resolution (revision-log.md) already establishes that a WRR can reach a state where some lines are committed/posted to inventory while others are not (there, as a cancellation edge case; here, as the normal path — every WRR now progresses line-by-line as a matter of course, not only when cancelled mid-stream).

**Amended 2026-08-20: the atomic step is now the unit, not the line.** §6.2's per-unit scan-suggest-commit loop means the smallest atomic commit step for a `store`-disposition line is now one physical unit, not the whole line. This section is rewritten accordingly. `inspect`-disposition lines (§6.3, whole-line "Hold") are unaffected by this re-scoping — that sequence still commits its whole line as one step, since §6.3 was never changed to a per-unit loop (only §6.4's *proposed*, currently-blocked per-unit Hold *override* on a `store` line touches `inspect`-shaped posting at unit grain, and that is not implementable yet — see §6.4).

**Per-unit commit command (`store` lines, §6.2).** Each unit's commit receives the WRR ID, the specific `wrr_items.id`, the accepted-or-overridden location for this one unit, a client correlation ID, and an idempotency key scoped to this individual unit-commit event (not to the line — see the idempotency paragraph below). Within one transaction, for that unit alone, it:

1. verifies the line is still in a commit-eligible state (not already fully committed, not cancelled) and that this specific unit has not already been committed by a duplicate/retried request (idempotency check, below);
2. verifies the target location's active/`storage` state and current available remaining CBM capacity are still valid for one more unit — capacity is re-checked at commit time, not assumed from the suggestion shown a moment earlier;
3. **on this line's first unit to commit**: creates the `lots` row with `status = 'available'`, `lot_number` copied from `wrr_items.lot_number` (the single canonical identifier), and `wrr_item_id` set. **On every subsequent unit for the same line**: reuses the already-created lot (resolved via `wrr_item_id`); no second `lots` row is created for the same line under the current disposition model (§7's note, §6.4);
4. **for the chosen location**: if this lot has no existing `lot_location_balances` row at that location yet, creates one with `qty_received = 1`, `qty_remaining = 1`, `qty_committed = 0`; if a row already exists for this lot at that location (a prior unit on the same line already went there), increments its `qty_received` and `qty_remaining` by 1 instead of inserting a duplicate row — the `unique(lot_id, location_id)` constraint requires this upsert-or-insert behavior, and is exactly what makes §6.2b's multi-location split possible without a schema change;
5. sets `wrr_items.putaway_location_id` to this unit's chosen location (§5.1's 2026-08-20 re-interpretation: this now reflects only the most-recently-used location for the line, not necessarily the only one);
6. inserts one immutable `inventory_transactions` row with `movement_type = 'receiving'`, `qty = 1`, and `to_location_id` set to this unit's chosen location;
7. increments the line's committed-unit count (tracked via the already-existing `wrr_items.scanned_qty`/commit-state fields per §5.2 — no new column is introduced by this amendment to track "units committed so far" separately from "units scanned," since a unit is scanned and committed together in the same loop iteration per §6.2);
8. once this commit brings the line's committed-unit count to `expected_qty`, marks the line's terminal committed state (`wrr_items.committed_at`, re-scoped below) and re-evaluates the parent WRR's aggregate completion state, updating `wrr_documents.status` accordingly;
9. records audit/correlation data according to the approved cross-cutting design.

**Per-line commit command (`inspect` lines, §6.3) — unchanged from 2026-08-10.** Each whole line's commit still applies in one transaction exactly as previously documented: creates the lot with `status = 'quarantined'`, `lot_number` copied from `wrr_items.lot_number`, `wrr_item_id` set; creates `lot_location_balances` at the confirmed `inspection` location with the confirmed quantity as `qty_received` and `qty_remaining`; inserts one immutable `inventory_transactions` row with `movement_type = 'receiving'` and `to_location_id` set to the inspection location; emits an inspection case event for `11`; marks the line's terminal committed state and re-evaluates WRR completion.

The `lot_location_balances` rows created by each per-unit or per-line commit are the authoritative source for `lot_inventory_totals`. No other balance ledger or aggregate table is created or maintained by this feature.

**Idempotency, re-scoped to the unit-commit event (amended 2026-08-20).** Previously (2026-08-10), `wrr_items.committed_at` served two roles at once for a `store` line: the single per-line idempotency gate for that line's one commit event, and the marker of the line's terminal committed state — because under the per-line model those were the same event. Now that a `store` line commits N times (once per unit), those two roles split: **`wrr_items.committed_at` is re-scoped to mean only "this line has reached its terminal committed state"** (set once, on the unit-commit that brings the line to `expected_qty` committed units — step 8 above) — its existing `BEFORE UPDATE` trigger protection (`wrr_items_protect_committed_at`, migration `0022_receiving_inventory_insert_policies.sql`) is unaffected, since it still only ever transitions `NULL → non-NULL` once. **Per-unit-commit idempotency uses the general command idempotency-key mechanism already described in §4** (client correlation ID + idempotency key, checked before any write), scoped to the individual unit-commit request rather than reused from `committed_at`; the exact storage/lookup mechanism for that per-unit idempotency check (e.g., matching against the already-inserted `inventory_transactions` row for a retried request) is an implementation-level detail for the follow-up rework pass, not a schema/invariant question requiring `01`'s sign-off — no new table or column is proposed here for it. `inspect`-disposition lines' per-line idempotency is unchanged from 2026-08-10 and continues to use `committed_at` exactly as before, since that sequence still commits as one event.

The idempotency mechanism, for both the `store` per-unit and `inspect` per-line cases, returns the original authoritative result for a duplicate key. It never treats a client-local "stored"/"held" state as proof of commit. A failed unit-commit (or, for `inspect`, line-commit) rolls back completely for that unit/line only; it remains in its pre-commit scanned/pending state and the result is a safe recoverable error. A failure on one unit has no effect on any other unit's — or any other line's — already-committed state, whether the two committed units belong to the same line or different lines.

**Resolved 2026-08-10 (Product Owner decision)**: `wrr_status` stays as-is — `staged_pending_arrival`, `receiving_in_progress`, `confirmed`, `cancelled`. No new enum value is added. `receiving_in_progress` covers the entire window from the first line committing through the last, whether 0 or N-1 of N lines are done; which lines are committed and which are pending is already tracked at the `wrr_items` row level (§5.2's scan-line state), not on the parent WRR status, so the parent status doesn't need to distinguish "just started" from "9 of 10 lines committed." `wrr_documents.status` transitions to `confirmed` only once every line on the WRR has reached a terminal committed state. **Still correct after the 2026-08-20 per-unit re-scoping**: `receiving_in_progress` now additionally covers the finer-grained window of a single `store` line with some units committed and others not — the same reasoning applies one level down, since per-unit progress is tracked on `wrr_items`/the unit-commit ledger, not on `wrr_documents.status` either. No further `wrr_status` change is proposed by this amendment.

This also corrects a stale reference: the 2026-08-09 cancellation-resolution entry in `revision-log.md` described a cancelled-with-some-lines-committed WRR as closing with "`partial` status" — that value was never actually added to the schema, and per this decision it never will be. A cancelled WRR with some lines already committed closes with `wrr_status = 'cancelled'`; the already-committed lines' `lots`/`lot_location_balances`/`inventory_transactions` rows stand as posted (nothing about those rows is undone by cancellation). "Partial" describes the *outcome* in prose, not a distinct status value. See `revision-log.md`'s 2026-08-10 entry for the correction.

**Added 2026-08-10 (rbac-rls-reviewer gap fix, `0022_receiving_inventory_insert_policies.sql`)**: two contained gaps in the per-line commit path's DB-layer protection are closed. (1) `lots`, `lot_location_balances`, and `inventory_transactions` previously had SELECT-only RLS policies and grants — `commitWrrLine`'s inserts into all three were relying on no enforced INSERT policy at all. INSERT policies gated on `receiving.confirm` (and, for `inventory_transactions` only, also `dispatch.execute`, since `dispatchPickList` in `08` also inserts there) plus matching narrow `GRANT INSERT` are added. (2) `wrr_items.committed_at` (§9's per-line idempotency gate) had no protection against being reset from a timestamp back to `NULL` by a later UPDATE — a `BEFORE UPDATE` trigger (`wrr_items_protect_committed_at`) now rejects any attempt to change `committed_at` once it is non-NULL, closing the double-post risk without adding a `WITH CHECK` clause to `wrr_items_update` (which deliberately has none, per its own comment in `0012_receiving_disposition_and_policies.sql`).

## 10. Putaway and incoming ledger

Receiving consumes the approved location/capacity suggestion interface. It may display remaining CBM and candidate `locations`, but it does not create a second capacity calculation or own location enrollment. Putaway recommendations apply only to lots committed with `store` disposition; quarantined lots at the `inspection` location are handed off to `11` for resolution before any putaway recommendation applies.

**Timing reversed 2026-08-10**: this same suggestion interface is now invoked at pre-store time (§6.2), not only as a post-commit recommendation — the sequence is scan → suggested location → accept/override → "Store" → per-line commit (§9), rather than commit first and recommend putaway afterward. This is a change in *when* the existing interface is called, not a new interface or a new capacity calculation; nothing in this section's data contract (remaining CBM vs. candidate `locations`) changes.

**Granularity amended 2026-08-20**: the interface is now called once per scanned unit (§6.2), not once per line-batch, and its contract is clarified as returning every currently-eligible candidate location (§6.2a), not a single narrowed suggestion. This remains the same interface and the same underlying remaining-CBM-vs-candidate-`locations` calculation §10 has always described — only the call frequency and the "return all eligible candidates, not one" framing are new.

The Incoming Ledger is a server-side query/view over `inventory_transactions` filtered by `movement_type IN ('receiving', 'putaway')`, joined through approved relationships for WRR, item, lot, party, user, and location display. It is read-only and scope-filtered. Historical corrections are new domain transactions, never ledger edits.

**Reached via `/receiving`, not a separate route (updated 2026-08-09).** The Incoming Ledger is the "Ledger" tab on `receiving/page.tsx` (`?tab=ledger`), confirmed-only with no status filter shown, alongside the default "Work Queue" tab (all statuses, filterable) that was already `receiving/page.tsx`'s existing content. There is no standalone `/incoming-ledger` route — see §3's route block.

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
- WRR creation/edit, CIPL upload, unknown item enrollment, inspection resolution, receipt confirmation, and putaway confirmation are Tier 2/online-only in v1. This is the complete list — no other receiving mutations are candidates for Tier 1 offline. **Clarified 2026-08-20**: "receipt confirmation" here covers every per-unit "Store"/"Hold" commit event introduced by §6.2/§6.3/§9's per-unit model, not only a single end-of-line or end-of-WRR event — each individual unit's commit is itself a Tier 2/online-only receipt-confirmation action, same as before this amendment, just now occurring at unit frequency rather than line frequency. Scanning/reconciling a unit (recording that it was seen) remains the only Tier 1 candidate; the location suggestion display and the "Store"/"Hold" commit tap itself both require an online round trip, same as the location-suggestion/commit step always has.
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
- [ ] **Added 2026-08-10, not yet resolved**: the per-line-immediate-commit / scan-then-suggest-location reversal (§4, §5.1, §6.1–§6.3, §9, §10) has not been through `db-migration-verifier` or `rbac-rls-reviewer` in this form — the previously-applied production migration and RLS policies reflected the now-superseded 2026-08-09 pre-scan-location/single-atomic-commit model (see `revision-log.md`'s 2026-08-10 entry). This checkbox stays open until the already-shipped `lib/receiving/wrr-schema.ts`, `lib/receiving/scan-matcher.ts`, `lib/receiving/commit-validation.ts`, `lib/actions/receiving.ts`, and `app/(authenticated)/receiving/new/_components/wrr-line-items.tsx` are reworked to this document's current text and re-verified. This document-only pass does not touch any of those files.
- [x] **Added 2026-08-10, resolved 2026-08-10**: `wrr_status` needs no new value for the per-line-commit normal path — Product Owner decided `receiving_in_progress` already covers "some lines posted, not yet all," since per-line completion is tracked on `wrr_items`, not the parent WRR status. See §9's resolution and `revision-log.md`'s 2026-08-10 entry, which also corrects the 2026-08-09 cancellation entry's stale "`partial` status" wording (no such enum value exists or will be added; a cancelled-with-partial-completion WRR closes as `cancelled`).
- [ ] **Added 2026-08-20, not yet resolved**: `01-core-data-model`'s own amendment/approval process must resolve §6.4's per-unit Hold override on an otherwise `store`-disposition line — whether via (a) two `lots` rows sharing one `lot_number`, differentiated by disposition/status, or (b) moving quarantine/status tracking to a finer grain than the lot row, or another resolution `01` chooses. §6.4 deliberately does not pick one. This checkbox stays open, and §6.4/point 4 of the 2026-08-20 amendment stays unimplemented, until `01` resolves it.
- [ ] **Added 2026-08-20, not yet resolved**: the per-unit scan-suggest-commit loop, multi-candidate location list, and multi-location split (§4, §5.1, §6.2–§6.2b, §9, §10) reopen the same unresolved `db-migration-verifier`/`rbac-rls-reviewer` gate the 2026-08-10 checkbox above already named — that checkbox was never closed, and this amendment further changes the shape of what needs (re-)verification once implementation resumes: the per-unit idempotency mechanism (§9), the upsert-vs-insert `lot_location_balances` write per unit, and the capacity re-check on every unit's commit are all new surface area beyond what the 2026-08-10 review scope covered.
