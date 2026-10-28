# Receiving Scan → Putaway → Store Loop

Status: Proposed implementation plan

## Objective

Make receiving a focused, mobile-first three-stage workflow. The operator works
on one unfinished WRR line at a time:

```text
1. Scan & Verify → 2. Assign Locations → 3. Store → back to 1 for the next line
```

The workflow must preserve the approved batch behavior: one valid carton QR
identifies the related WRR line, all cartons for that line can be assigned to
one or more locations, and one Store action commits the line atomically.

## Stage 1 — Scan & Verify

### Behavior

- Open the receiving screen in scan mode by default.
- Present one dominant action: `Scan carton QR`.
- Accept camera scans and scanner-keyboard input.
- Resolve the QR through the existing WRR/carton matcher.
- On a valid scan, identify the WRR line and load its current live state.
- Reject unknown, wrong-line, duplicate, over-quantity, and invalid-status scans
  with a clear inline message and preserve scan focus.

### Information hierarchy

Show, in order:

1. Step indicator and WRR number.
2. Scan action and status feedback.
3. Active line summary: item, lot, UOM, SPQ, expected cartons, scanned cartons,
   and remaining cartons.
4. Secondary `Continue to Putaway` action enabled only after a valid scan.

Do not show the entire WRR line table as the primary interaction. A compact
`Other lines` disclosure may show progress without competing with the active
line.

## Stage 2 — Assign Locations

### Behavior

- Display only the active line and its uncommitted carton quantity.
- Allow a carton or carton group to be assigned to a location.
- Support multiple locations for one line.
- Update assigned quantities and remaining quantities immediately in local UI
  state.
- Refresh location capacity/availability after each selection from the current
  server-backed location data where available.
- Prevent allocation above the remaining carton quantity or location capacity.
- Keep assignments when the operator navigates back to Stage 1.

### Information hierarchy

Show, in order:

1. Step indicator and active line summary.
2. Remaining cartons to place.
3. Location assignment rows.
4. Capacity/remaining indicators.
5. One dominant `Continue to Store` action.

Use progressive disclosure for carton identifiers and technical payloads. The
operator should see item, lot, carton number, and location—not raw QR JSON or
UUID payloads unless opening an optional details view.

## Stage 3 — Store

### Behavior

- Present a final review of the active line and all location allocations.
- Require an explicit `Store cartons` action.
- Submit the existing atomic line-commit command with the complete allocation
  set and the current expected version/state.
- Let the server revalidate WRR status, line quantities, item/lot identity,
  location activity/type, capacity, duplicate scans, and stale writes.
- On failure, remain in Stage 3, preserve the form, and identify the failed
  allocation or correction needed.
- On success, show a concise confirmation with cartons stored and locations.

## Post-Store loop

After a successful Store:

1. Re-fetch the WRR and live line progress.
2. If unfinished lines remain, reset the workflow to Stage 1.
3. Focus the scan input/camera trigger automatically.
4. Exclude the completed line from the next-line suggestion.
5. If no unfinished lines remain, show `Receiving complete` with actions to
   review the receipt or finish the WRR.

The loop must not create a second commit for a previously stored line. The
server-side `committed_at`/idempotency guard remains authoritative.

## Navigation and accessibility

- Use a visible step indicator with text labels, not color alone.
- Provide `Back` and `Cancel` controls with confirmation when assignments exist.
- Keep primary actions at least 44px high and reachable on mobile.
- Move focus to the active stage heading after each transition.
- Announce scan success, validation errors, and Store success with a live region.
- Keep error text adjacent to the failed control and use a summary for multiple
  allocation errors.
- Maintain keyboard navigation and visible focus states.
- Do not rely on camera-only interaction; scanner input and manual fallback are
  required.

## State model

```ts
type ReceivingStage = "scan" | "assign" | "review" | "complete";

type ReceivingSession = {
  wrrId: string;
  activeWrrItemId: string | null;
  stage: ReceivingStage;
  scannedUnitIds: string[];
  allocations: Array<{ locationId: string; qty: number }>;
  serverVersion?: string;
};
```

The server remains the source of truth. Client state is only a draft until the
Store command succeeds.

## Implementation sequence

1. Extract the current receiving page into a stage-shell component.
2. Add a compact step indicator and stage state model.
3. Move QR handling into Stage 1 and connect it to the existing matcher.
4. Reuse `PutawayLocationSelector` in Stage 2 with live local totals.
5. Add the Stage 3 review and connect it to `commitWrrLine`.
6. Add success re-fetch and unfinished-line loop behavior.
7. Add focus management, live-region announcements, and manual scanner input.
8. Preserve existing authorization, RLS, capacity validation, and idempotency.

## Verification

- Valid QR opens the correct line and does not expose raw payloads in the main
  UI.
- Wrong or duplicate QR remains in Stage 1 with an actionable message.
- One line can be split across multiple locations.
- Location totals update before Store and cannot exceed capacity.
- Store commits once and returns to Scan for another unfinished line.
- Completed lines cannot be committed again.
- All lines complete shows the completion state.
- Refreshing during Stage 2 does not create inventory or lose already committed
  data.
- Keyboard, screen-reader, mobile viewport, and scanner-keyboard paths work.
- Existing receiving authorization and real-Postgres commit tests continue to
  pass.

