# Camera Scanner Wiring & Per-Unit WRR Labels — Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow this repo's RED → GREEN → REFACTOR → VERIFY cycle (`.claude/skills/implement-feature/SKILL.md`) — a failing test exists before any implementation code, for every checklist item, every time.

**Goal:** Close out the two items still pending from Milestone 1's receiving/barcode work — camera-based scanning actually reachable on the floor, and per-unit WRR labels that genuinely support exact duplicate-scan detection, not just a fuzzy running count.

**Important — read this before assigning work:** a prior audit this session (before the commits that landed the components below) concluded both of these were unbuilt. They are not. Significant real work already exists. This plan's Phase 0 is a corrected, file-cited state audit — read it first so work isn't duplicated or re-built from scratch. The remaining tasks are real gaps, not a green-field build.

---

## Phase 0 — Corrected current-state audit (read first, do not skip)

### Camera scanner (spec `18-barcode-integration` §1)

| Piece | State | Evidence |
|---|---|---|
| `MobileQRScanner` component | **Done.** `html5-qrcode`-based, QR/DataMatrix support, gated Code-128 `WAN:` path, pause-on-decode, tested. | `components/barcode/MobileQRScanner.tsx`, `components/barcode/__tests__/MobileQRScanner.test.tsx` |
| `ReceivingCameraScanner` wrapper | **Done.** Toggles the camera open/closed, plays the spec'd 800Hz/100ms Web Audio beep on decode, calls back with the raw decoded string. | `app/(authenticated)/receiving/[wrrId]/receive/_components/ReceivingCameraScanner.tsx` |
| Wired into the floor receive screen | **NOT done.** `ReceivingCameraScanner` is not imported or rendered anywhere in `receive/page.tsx`. It exists as an orphaned component with no caller. | Confirmed by grep — zero matches for `ReceivingCameraScanner` under `app/(authenticated)/receiving/[wrrId]/receive/page.tsx` |

**Net: the floor scan screen still only accepts keyboard-emulated scanner input. A phone camera cannot be used to scan a WRR today, despite every piece existing to make that work.** This is Task A below — genuinely small, not a rebuild.

### Per-unit WRR labels (spec `18-barcode-integration` §2.2, spec `07` §6/§9)

| Piece | State | Evidence |
|---|---|---|
| `WRRUnitLabelGenerator` component | **Done.** Generates N labels (N = `expectedQty`) per line, each with a unique `unit_id` (via `crypto.randomUUID()`), payload `{"type":"wrr_item_unit","wrr_item_id":"...","unit_id":"..."}`, print-ready grid layout. | `components/barcode/WRRUnitLabelGenerator.tsx` |
| Wired into WRR detail page | **Done**, unconditionally available per line (a "Print Unit Labels (N)" button per row, not gated on a vendor flag — see Task E note on whether that's the right default). | `app/(authenticated)/receiving/[wrrId]/page.tsx` lines 282-288 |
| `scan-matcher.ts` recognizes the payload | **Partially done.** Parses the JSON, extracts `wrr_item_id`, and resolves it directly to the matching line (`l.id === parsedWrrItemId`) — this part works and is a genuine improvement over plain-string matching. | `lib/receiving/scan-matcher.ts` lines 66-91 |
| **Duplicate detection via `unit_id`** | **NOT done — this is the actual point of the whole design and it's currently a no-op.** `unit_id` is parsed out of the JSON at line 66-77 but **never read again anywhere in the file**. Once a line is matched, the function falls through to the exact same `scannedQty` counter logic every other barcode type uses (lines 114-126). Scanning the *same physical label* twice currently increments `scannedQty` twice, exactly like scanning two different labels — the failure mode `18` design.md §2.2 was written specifically to prevent (*"a duplicate scan would silently pass as a legitimate second unit before the expected count is reached"*) is live today. | `lib/receiving/scan-matcher.ts` — no `unit_id` reference past line 72 |
| Persistence for "which unit_ids have already been scanned" | **Does not exist.** No table, no column, no migration. There is currently nowhere to even check "has this specific label been seen before" against. | Confirmed by grep across `supabase/migrations/` and `lib/db/schema/` |
| Item-code display bug on the label | **Real bug, not a gap.** `WRRUnitLabelGenerator`'s `itemCode` prop is passed `item.itemId ?? item.lotNumber` from the WRR detail page — `item.itemId` is the item's UUID foreign key, not a human-readable code. Printed labels currently show a raw UUID instead of the actual item code whenever `itemId` is set (i.e. whenever the item is enrolled — the common case). | `app/(authenticated)/receiving/[wrrId]/page.tsx` line 285 |

**Net: the label-generation and printing UI is real and solid. The actual duplicate-detection mechanism it exists to enable is not implemented at all — it's currently equivalent in behavior to printing N identical labels, the exact thing the design rejected.** This is Tasks B–D below, and it's the substantial remaining work in this plan. Task E is the small display-bug fix.

---

## Global constraints

- `supabase/migrations/*` and `lib/db/schema/*` are Track-3-locked per `specs/00-steering/multi-agent-work-division.md` — work this branch on `track-3-validation-and-m2` (already the active branch for this repo's receiving work this session), not a Track 2 branch.
- Every DB-touching task needs a real-Postgres `db-migration-verifier` pass before it's done — mocked tests are not sufficient per `specs/00-steering/testing.md`.
- `recordScan` (and any new per-unit scan-recording path) is Tier 2/online-only, per `specs/07-incoming-receiving/requirements.md` — do not make this reachable from the offline queue.
- Capability strings: reuse `receiving.scan`/`receiving.confirm` — this plan introduces no new capability, per `specs/00-steering/multi-agent-work-division.md`'s locked capability vocabulary rule.
- Follow the already-established per-line commit model (`specs/07-incoming-receiving/design.md` §9, 2026-08-10 reversal) — nothing here reopens or changes that.

---

## Phase 1 — Wire the camera scanner into the floor receive screen (Task A)

### Task A: Render `ReceivingCameraScanner` on `receive/page.tsx`, feeding its output into the existing scan pipeline

**Files:**
- Modify: `app/(authenticated)/receiving/[wrrId]/receive/page.tsx`
- Modify (if needed for client/server boundary): a new small client component may be needed to bridge `ReceivingCameraScanner`'s `onScanSubmitted(barcode: string)` callback into the existing `handleScan` Server Action, since `receive/page.tsx` is a Server Component and `ReceivingCameraScanner` is `"use client"`.
- Test: `app/(authenticated)/receiving/[wrrId]/__tests__/receive.page.test.ts` (existing file — extend it)

**Current mechanism to preserve, not replace:** the page's existing `handleScan` inline Server Action (reads `barcode` from `FormData`, calls `recordScan`, redirects with `?result=...`) stays exactly as-is. The camera scanner is a second *input method* feeding the same pipeline, not a parallel code path — keyboard-emulated scanner input must keep working unchanged for hardware-scanner-equipped stations.

**Design decision needed (resolve before implementing):** `ReceivingCameraScanner`'s callback is a plain client-side function (`onScanSubmitted: (barcode: string) => void`), but `handleScan` is a Server Action bound to a `<form>` submission. The bridge needs one of:
- (a) A small client wrapper that holds the decoded barcode in state and programmatically submits a hidden form (simplest, keeps the Server Action untouched), or
- (b) Calling the Server Action directly as a function from client code via `next/server-actions`' direct-invocation pattern (check whether this repo already does this anywhere as precedent before introducing a new pattern).

Prefer (a) unless a `db-migration-verifier`/`build-doctor`-blessed precedent for (b) already exists elsewhere in `app/(authenticated)/**` — grep for one before deciding.

- [ ] **RED**: `test-writer` writes a test proving that when `ReceivingCameraScanner`'s `onScanSubmitted` fires with a decoded payload, the same `recordScan` action is invoked with that payload as `barcode` (component-level test, mocking the action) — confirm it fails because the wiring doesn't exist yet.
- [ ] **GREEN**: `frontend-builder` renders `<ReceivingCameraScanner onScanSubmitted={...} />` on the floor scan screen (above or beside the existing keyboard-input form, per `brand-design-system.md` §3's one-primary-action rule — the camera toggle button and the manual input should not both read as equal-weight primary actions; the existing manual input auto-focuses on load per the file's existing `autoFocus` behavior, so the camera scanner should present as a clearly secondary/alternate entry point, e.g. below the manual input, not competing with it), wires its callback to submit through the existing `handleScan` mechanism.
- [ ] **VERIFY**: `design-system-auditor` (floor-screen primary-action rule, touch targets, no glassmorphism — `ReceivingCameraScanner` already looks compliant on inspection but confirm); `offline-sync-reviewer` (confirm the camera-scan path is exactly as online-only/Tier-2 as the existing keyboard path — it should inherit `handleScan`'s existing behavior unchanged, not introduce a new offline-queueable surface).
- [ ] Run `npx vitest run "app/(authenticated)/receiving"` and `npx tsc --noEmit`, confirm clean.
- [ ] Manual/`run`-skill check: actually open the floor scan screen on a mobile viewport and confirm the camera permission prompt, live feed, and a real decode round-trips into a scan result — this is exactly the class of thing unit tests can't catch (camera permissions, live video, real device behavior).

---

## Phase 2 — Real per-unit duplicate detection (Tasks B–D)

This is the substantial remaining work. Do these three tasks in order — B (schema) before C (matcher logic) before D (action wiring) — each is a real RED→GREEN→VERIFY cycle, not one big commit.

### Task B: `wrr_item_unit_scans` tracking table

**Files:**
- Create: `supabase/migrations/00XX_wrr_item_unit_scans.sql` (next number after whatever exists when this is picked up — check `supabase/migrations/` yourself, do not assume a number)
- Modify: `lib/db/schema/wrr.ts` (add the matching Drizzle table)
- Modify: `specs/01-core-data-model/design.md` (schema amendment note, matching this file's existing inline-comment convention for schema amendments — see the `committed_at`/`putaway_location_id` entries already there as the pattern to follow)

**Shape** (design decision, since neither `18` nor `07` design.md fixes an exact table — ground it in what the payload and the matcher actually need):

```sql
CREATE TABLE public.wrr_item_unit_scans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wrr_item_id  uuid NOT NULL REFERENCES public.wrr_items(id),
  unit_id      uuid NOT NULL,   -- the label's own unique per-unit identifier
  scanned_at   timestamptz NOT NULL DEFAULT now(),
  scanned_by_user_id uuid REFERENCES auth.users(id),

  -- The whole point of this table: the same physical label can never be
  -- recorded as a fresh scan twice.
  CONSTRAINT wrr_item_unit_scans_unique_unit UNIQUE (wrr_item_id, unit_id)
);

CREATE INDEX wrr_item_unit_scans_wrr_item_id_idx ON public.wrr_item_unit_scans (wrr_item_id);
```

Why a separate table rather than a column on `wrr_items`: a line has up to `expected_qty` units, each independently scannable — this is inherently a one-to-many relationship, not a single value. The `UNIQUE (wrr_item_id, unit_id)` constraint is the actual enforcement mechanism: a second INSERT attempt for the same `(wrr_item_id, unit_id)` pair fails at the database level, which is the correct place for this invariant to live (not just application logic that could be bypassed by a retry/race).

RLS: gate SELECT/INSERT on `receiving.scan` (same capability `recordScan` already requires), following the exact pattern `0012_receiving_disposition_and_policies.sql` and `0022_receiving_inventory_insert_policies.sql` already established for sibling tables — read those two files for the precise style before writing this migration's policies.

- [ ] `test-writer`: RED — real-Postgres integration test proving the unique constraint rejects a duplicate `(wrr_item_id, unit_id)` insert, and that RLS correctly gates INSERT/SELECT on `receiving.scan`.
- [ ] `database-builder`: GREEN — write the migration + Drizzle schema addition.
- [ ] `db-migration-verifier`: real-Postgres pass — apply cleanly on top of the current chain, positive/negative capability checks, uniqueness-constraint enforcement proof.
- [ ] `rbac-rls-reviewer`: confirm the new table's policies match the pattern established for `wrr_items`/`lots`/`lot_location_balances` and don't introduce a gap of the kind found and closed in the A2 rollout (`specs/00-steering/revision-log.md`, 2026-08-11 entries) — check this table specifically, don't assume it's covered by anything existing.

### Task C: Teach `matchScan` to actually check `unit_id` against recorded scans

**Files:**
- Modify: `lib/receiving/scan-matcher.ts`
- Modify: `lib/receiving/__tests__/scan-matcher.test.ts`

**Design decision:** `matchScan` is currently a pure function (`(barcode, lines, wrrFlowType) => ScanMatchResult`) with no DB access — that's correct and should stay that way (business logic stays pure/testable; the DB check belongs in the calling action). This task's actual job is:

1. Add a new `ScanMatchResult` failure reason: `"duplicate_unit_scan"`.
2. `matchScan` needs a new optional parameter carrying the set of already-scanned `unit_id`s for the matched line (e.g. `alreadyScannedUnitIds?: Set<string>` for the specific `wrr_item_id`, or shaped however the caller can most naturally supply it — decide based on what `recordScan`, which does have DB access, can cheaply provide). When the parsed payload's `unit_id` is present in that set, return `{ matched: false, reason: "duplicate_unit_scan" }` **before** falling through to the existing quantity-counter logic — this must take priority over `fully_scanned`/`over_quantity`, mirroring how `flow_type_mismatch` was already given priority treatment in the 2026-08-10 rework (same file, lines 104-112 — follow that same pattern/placement).
3. On a **successful** (non-duplicate) `wrr_item_unit` match, the result needs to carry the `unit_id` back to the caller somehow (extend the `matched: true` branch of `ScanMatchResult` with an optional `unitId?: string` field) so `recordScan` (Task D) knows what to INSERT into `wrr_item_unit_scans`.

- [ ] `test-writer`: RED — tests proving: a fresh `unit_id` matches normally; a `unit_id` already present in the supplied already-scanned set is rejected with `duplicate_unit_scan`, even when the line is not yet fully scanned by quantity; `duplicate_unit_scan` takes priority over `fully_scanned`; a `matched: true` result for a `wrr_item_unit` payload carries the `unitId`; non-`wrr_item_unit` barcodes are entirely unaffected (no `unitId` field, no duplicate-check attempted).
- [ ] `backend-builder`: GREEN — implement against those tests only.
- [ ] Update `getScanErrorMessage` in `receive/page.tsx` (the plain-language error-reason switch) with a `duplicate_unit_scan` case — something like *"This exact label has already been scanned — if this carton is genuinely new, check for a duplicate printed label."*

### Task D: Wire `recordScan` to check and persist `wrr_item_unit_scans`

**Files:**
- Modify: `lib/actions/receiving.ts`'s `recordScan`
- Modify: `lib/actions/__tests__/receiving.test.ts`
- New real-Postgres integration test (this repo's established pattern per `lib/actions/__tests__/receiving.commit-line.integration.test.ts` — reuse its harness conventions: real claim-reading `auth.uid()` stub, real RBAC seeding, `RlsTransactionDeps` override, not the module-level default)

`recordScan` already runs inside `withRlsTransaction` (per the A2 rollout completed earlier this session) — this task extends its existing transaction, it doesn't add a new one. Within the same transaction that already loads the WRR and its lines:

1. Before calling `matchScan`, if the incoming barcode parses as a `wrr_item_unit` payload, query `wrr_item_unit_scans` for that `wrr_item_id`'s already-recorded `unit_id`s and pass them into `matchScan` per Task C's new parameter.
2. On a successful, non-duplicate match, INSERT the new `(wrr_item_id, unit_id, scanned_by_user_id)` row into `wrr_item_unit_scans` in the same transaction as the existing `scannedQty` increment — both succeed or both roll back together (this is exactly why Task B's uniqueness constraint matters: even under a hypothetical race between two concurrent scans of the same physical label, the second INSERT fails at the DB level and that transaction rolls back cleanly, never double-counting).
3. On a `duplicate_unit_scan` rejection from `matchScan`, return the existing `RecordScanResult`'s `{ ok: false, reason }` shape — no new response shape needed, `reason` already flows through to `getScanErrorMessage` from Task C.

- [ ] `test-writer`: RED — mocked-DB unit tests (happy path with a fresh `unit_id`; rejection on a repeat `unit_id`; confirms the `wrr_item_unit_scans` insert and the `scannedQty` increment happen together) **and** a real-Postgres integration test proving: two `recordScan` calls with the same `unit_id` — the first succeeds and posts one `wrr_item_unit_scans` row, the second is rejected with `duplicate_unit_scan` and posts nothing (no partial state); a genuinely concurrent double-submit (fire both before either resolves) still results in exactly one recorded scan, proving the DB constraint — not just app-layer timing — is what's actually preventing the double-count.
- [ ] `backend-builder`: GREEN.
- [ ] `db-migration-verifier` / `rbac-rls-reviewer`: confirm the new INSERT is correctly RLS-gated (should already be covered by Task B's policy, but confirm the actual call site satisfies it — same "don't just check the policy exists, check it matches the real write" discipline used throughout the A2 closing review).
- [ ] Full suite + `tsc` clean.

---

## Phase 3 — Small fixes (Task E)

### Task E: Fix the item-code display bug on printed unit labels

**Files:**
- Modify: `app/(authenticated)/receiving/[wrrId]/page.tsx` line ~285

Change `itemCode={item.itemId ?? item.lotNumber}` to actually resolve and pass the item's real code (`items.code`, or whatever the canonical display field is per `01-core-data-model`'s `displayed_item_code` convention already used elsewhere in this codebase — check `lib/db/queries/receiving.ts`'s `WrrItemRow` type for whether the item code is already being fetched and just not threaded through to this component, which is the likely case, or whether the query needs extending).

- [ ] Confirm via `lib/db/queries/receiving.ts` whether `getWrrDocument` already returns an item code field on `WrrItemRow` that this page simply isn't using — if so this is a one-line fix; if not, extend the query first.
- [ ] `test-writer`: RED — a test asserting the rendered `WRRUnitLabelGenerator`'s `itemCode` prop is never a UUID-shaped string.
- [ ] `frontend-builder`: GREEN.
- [ ] Also worth a product decision, not a code fix: should "Print Unit Labels" be available unconditionally on every line (current behavior), or only surfaced when a line/vendor is flagged as not supplying usable barcodes, per `requirements.md` FR-3a.1's framing ("WHEN a back-office user is staging a WRR line for a vendor whose cartons arrive without usable/trusted barcodes")? Current unconditional availability isn't wrong — FR-3a.1 says the system "SHALL be able to," not "SHALL only," so leaving it as a manually-triggered button every time is a defensible reading — but flag this to the Product Owner rather than silently deciding it's settled, since the requirement's own wording implies a narrower default case.

---

## Verification checklist before calling this done

- [ ] Full `npx vitest run` — all green, no regressions.
- [ ] `npx tsc --noEmit` — clean.
- [ ] Real-Postgres integration tests (Task B, Task D) passing against a live disposable Postgres, not just mocked.
- [ ] `db-migration-verifier` sign-off on the new migration.
- [ ] `rbac-rls-reviewer` sign-off on the new table's RLS and the `recordScan` extension.
- [ ] `design-system-auditor` sign-off on the camera-scanner wiring (Task A) and the label-generator fix (Task E).
- [ ] `offline-sync-reviewer` confirms the camera-scan path and the unit-scan persistence remain exactly as online-only as the rest of `recordScan` already is.
- [ ] Manual device check: a real phone camera scanning a printed unit label round-trips correctly, and scanning the same printed label twice is visibly rejected on the floor screen with the new error message.
- [ ] Update `specs/18-barcode-integration/requirements.md`/`design.md` and `specs/07-incoming-receiving/tasks.md` checklist items to reflect what's now actually built, and log a `specs/00-steering/revision-log.md` entry summarizing the completion — this repo's standing rule against tracking-doc drift applies here same as everywhere else in this project.
