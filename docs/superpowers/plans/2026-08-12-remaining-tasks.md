# Remaining Tasks — Frontend/UI-UX Implementation Plan

> Companion status doc to `docs/superpowers/plans/2026-08-12-frontend-ui-ux-implementation-plan.md` (the governing plan — read that first, this file only tracks progress against its §14 execution order). Written mid-run so work can resume cold in a new session if this one ends before the plan is complete. **Read this file's "Resume instructions" section (bottom) before doing anything else in a fresh session.**

---

## Verified done — committed, do not redo

**Update (post-write):** both agents dispatched below have since reported back. `/enrollment` (step 2) is fully done and committed (`b60f594`) — see its own note further down, since the agent found the plan's 🔴 marker was stale (the page already existed and worked; the real gap was duplicated list-page markup across `/master-data/*`, now fixed). The audit-pass agent (step 1) has committed at least one real batch (`367c7b6`, Receiving/Incoming — found and fixed a genuine bug: an `onClick` handler embedded directly in a Server Component, which is invalid in the App Router and would have broken the build) but has not yet reported full completion — treat step 1 as still in progress, not done, until its final notification lands.

As of commit `1015af6` (confirmed via `git log`, all authored/landed before this status doc was written):

- **Barcode integration** (Task A-E from the earlier barcode completion plan): `wrr_item_unit_scans` table + RLS, exact per-unit duplicate-scan detection in `lib/receiving/scan-matcher.ts`, `recordScan` wired to check/persist it, camera scanner wired into the floor receive screen via `CameraScanBridge.tsx`, item-code display bug fixed on printed unit labels.
- **Backend wiring pass** (9 pages moved off mock data): Home (`/`), Approvals (list + detail), Pick + Dispatch, Transfers, Inspection (list + detail, new `listInspectionCases`/`getInspectionCase` query functions), Portal (home/inventory/orders/documents, new `listPartyVmiInventory`/`listPartyPickLists`/`listPartyPickListDocuments`/`listPartyAcknowledgementReceiptDocuments` query functions, new `lib/portal/resolve-party-scope.ts` helper).
- **Steel & Hazard design system**: `brand-design-system.md` §1/§2 rewritten (industrial slate + burnt safety-orange `#9A3412` accent, Space Grotesk + Inter + JetBrains Mono), `tailwind.config.ts` updated to match, `app/layout.tsx` loads Space Grotesk, 4 chart files' sanctioned hex-literal exceptions updated, 3 real WCAG contrast bugs found and fixed (verified with actual luminance math, not eyeballing — see the design doc's §1.1/§1.3 notes on exactly what was measured).
- **Shell/sidebar structural fixes**: grouped nav restored via `groupRoutesForSidebar` (was a flat list ignoring the 12-group structure), a real capability-gating bug fixed (nav previously showed links regardless of the session's actual grants), mobile "More" overflow added, real user display name/role wired in (was hardcoded "Admin User").
- **Full verification as of `1015af6`**: `npx tsc --noEmit` clean, `npx vitest run` — 92 files / 1252 tests, all green.

**Do not re-wire, re-style, or "fix" any of the above without first confirming an actual regression** — re-verify with a quick read + `tsc`/tests, don't rebuild from a plan re-read alone.

---

## Step 2 — DONE (`/enrollment`, plan §14 step 2, plan §7)

Committed at `b60f594`. **Correction to this doc's original plan cross-reference**: `/enrollment` was NOT actually a 🔴 unbuilt page — it already existed as a real, working tab shell (Parties/Items/Locations, real queries, correct per-tab capability gating). The plan's marker was stale relative to actual repo state at the time it was written.

**What was actually wrong and got fixed**: the three standalone `/master-data/{parties,items,locations}/page.tsx` list routes contained a line-for-line duplicate of the enrollment tabs' search/table/pagination markup. Converted to redirects into `/enrollment?tab=<x>` (preserving `search`/`page` query params for old bookmarks/links). The real `new/`/`[id]/`/`[id]/edit/` sibling routes are unchanged functionally — only their entry-point links (breadcrumbs, `cancelHref`) now point at `/enrollment?tab=<x>` instead of the now-redirecting bare list pages, and each `_actions.ts` now also revalidates `/enrollment`. Added 15 new tests. Verified: `tsc` clean, full suite **1267/1267** (+15, no regressions).

**Lesson for the rest of this run**: don't trust this plan's 🔴/🟡/🟢 markers as ground truth without a quick real check — audit before rebuilding, the same discipline step 1 is already applying to the pages it's marked 🟢.

## Step 1 — IN PROGRESS (audit pass on all 🟢 pages, plan §14 step 1)

At least one batch committed (`367c7b6`, Receiving/Incoming) — found and fixed real bugs, not just drift: an `onClick` handler embedded directly in a Server Component (`receiving/[wrrId]/print/page.tsx` — invalid in the App Router, would have broken the build; extracted into a new `PrintButton` client component), several missing design.md §5.3 print-contract fields on the WRR print page (CIPL reference, PEZA/IP/MAWB numbers, resolved vendor name/code, item name, UOM — schema columns already existed, `getWrrDocument` just wasn't selecting them), stale raw-UUID display on both the print page and the WRR detail page's Item Code column (Task E from the earlier barcode plan only fixed the label-generator prop, not this visible table column). **Flagged, deliberately not fixed**: REPRINT watermarking — needs schema-level print-event tracking that doesn't exist yet, out of scope for an audit-and-fix pass.

**Still has more batches to go** (§1 Overview, §4 Outgoing/Withdrawal, §5 Transfers & Inspection, §6 Approvals, §12 Party Portal — this agent was scoped to check all of these, only Receiving/Incoming is confirmed committed so far). **When you resume**: check `git log` for further commits from this agent past `367c7b6` before assuming the rest of these page groups are unaudited — it may have continued and committed more since this doc was last updated.

---

## Not started — remaining plan §14 steps 3-8

Work in this order (each step's full spec is in the main plan doc — this list is a pointer, not a replacement for reading that section before starting):

### Step 3 — `/documents` (plan §8)
🔴 registry `launchStatus: planned` — correctly excluded from nav until real. No spec text defines the tab shell (only two detail routes exist in spec 10) — this is the plan's own synthesis on top of those, using `05`'s Shared Table-Action Contract. **Do not flip the registry's `launchStatus` to `launch` until both tabs are genuinely wired** — that flag controls nav visibility for real sessions.

Two tabs (Pick Lists, Acknowledgement Receipts), exact printed-field contracts in the plan §8 — pay special attention to the conditional unit-price-display rule (Trading: final price; VMI: reference price + mandatory verbatim disclaimer; Supplies: no price shown at all, fields omitted not zeroed) — this is the single easiest thing to get wrong on this page.

### Step 4 — `/billing-pricing` (plan §9)
🔴, most complex remaining page. Two tabs (VMI owned by spec 12, Trading owned by spec 13), tab-shell pattern should now be proven out from `/enrollment` and `/documents` — reuse whatever shell pattern those two settled on rather than inventing a third. Exact ledger column lists and the Trading tab's **column-level** capability gating (`trading.margin_view` — four columns omitted entirely, not nulled, when absent) are in the plan §9, do not approximate.

### Step 5 — `/reports` (plan §9)
🟡 — components likely partially exist in `components/analytics/`/`components/reporting/`. Audit what's there against the plan's exact prop tables and the "exactly 6 KPI cards, don't add or drop any" rule before writing anything new. Hard rule: all aggregate queries must read `lot_inventory_totals`, never raw-aggregate `lot_location_balances`.

### Step 6 — `/sync` (plan §10)
🔴, lowest spec-certainty page in the whole plan — no spec literally defines this page, only the underlying `outbox`/`sync_log` data model and an `OfflineStatus` contract from `@/lib/offline`. Build conservatively against that exact contract; the Failed/Syncing/Completed tab-to-data mapping is this plan's own synthesis, stated as such — don't cite it as spec-mandated in code comments.

### Step 7 — `/profile` + `/settings/*` (plan §11)
`/profile` is 🔴 and needs a genuine layout correction, not just restyling — it was previously built with office-pattern tabs despite being a `surface: "shared"` (floor-reachable) route, which is a confirmed design-system violation per the 2026-08-08 amendment cited in the plan. Rebuild as three stacked full-page sections (Account/Security/Preferences), no `<Tabs>`, floor touch-target/contrast rules apply.

`/settings/team` (🔴, verify before assuming done — check for `MOCK_` markers) has the most concrete spec: exact `<UserManagementGrid>` join shape and the exact Zod schema for the Invite User flow are both in the plan §11, copy them verbatim rather than re-deriving. `/settings/security` and `/settings/general` have thin spec coverage — build only what's explicitly named, resist the urge to add scope (no SSO/SAML, no capability-matrix builder, both explicitly out of scope).

Also fix while touching `/settings`: the redirect-on-unauthorized target is documented as `/dashboard` in spec 21's own text, which is a stale route (renamed to `/reports` in 2026-08-07) — redirect to `/` instead and note the correction.

### Step 8 — Cross-cutting final pass (plan §13)
Run the plan's §13 checklist against **every** page in the document, including the 🟢 ones already verified in step 1 above — this is the pass most likely to catch a design-system-auditor-class finding (raw hex colors, wrong touch targets, floor/office pattern mismatches) that a page-by-page build pass would miss. Do this last, once every page exists, not incrementally.

---

## Standing rules for whoever resumes this (repeated from the main plan, worth restating under time pressure)

- **Commit after each verified step** — this was an explicit user decision for this run (checkpoints directly on `main`, not a separate branch). Don't accumulate hours of uncommitted work.
- **`npx tsc --noEmit` clean and `npx vitest run` fully green before any step is "done."** Track the test count — a silent drop means something broke, not that a test was legitimately removed.
- **Never reintroduce mock data into an already-verified page.** Grep for `MOCK_`/`TODO: wire` before trusting a page is finished.
- **Capability gates are load-bearing** — every page's gate must match `lib/shell/registry.ts`'s literal string and be enforced server-side, not just hide a nav link.
- **No raw hex colors** outside the one sanctioned recharts exception (and even then, only exact matches to an already-documented `brand-design-system.md` §1 token).

## Resume instructions for a fresh session

1. Read `docs/superpowers/plans/2026-08-12-frontend-ui-ux-implementation-plan.md` in full — the governing plan.
2. Read this file in full.
3. Run `git log --oneline -15` and `git status --porcelain` — reconcile against the "In progress" section above. The two dispatched agents may have finished, partially finished, or failed since this doc was written; do not trust this doc's snapshot over live repo state.
4. If either in-flight item is incomplete or uncommitted, finish verifying and committing it **before** starting Step 3 — don't leave two unresolved threads while starting a third.
5. Continue with Step 3 onward in order. Update this file's "Verified done" / "Not started" sections as you go, so the next resume (if any) has an accurate picture — this doc is meant to be kept current, not written once and left stale.
