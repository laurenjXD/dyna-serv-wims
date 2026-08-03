# Testing — Hyperion 3PL / Dyna-Serv
Status: Approved

## Tooling
- **Unit tests**: Vitest
- **E2E tests**: Playwright
- **Database logic** (RLS policies, SQL functions like `replay_receiving_scan`, `compute_vmi_period_billing`): tested at **two stages**, not one:
  1. **During development** — mocked/unit-level tests (fast iteration, no real DB dependency, run on every commit)
  2. **Before `tasks.md` sign-off** — real-Postgres integration tests, following the same pattern used earlier in this project: spin up actual Postgres, run the real migrations in order, exercise the actual functions with real data, and assert on real results (not mocked). This is what caught the CBM/carton unit-mismatch bug and the `@supabase/ssr` version incompatibility earlier — mocked tests alone would have missed both.

## Floor/hardware-dependent features (scanning, offline sync)
**Default: simulate in software.** Physical hardware QA is reserved for right before launch, not required per-feature sign-off. Concretely:
- Barcode scanner input → simulated as keyboard `Enter`-terminated input events in Playwright (matches how real scanners emulate keyboard input per the `ScannerInput` component design)
- Offline/online transitions → simulated via `navigator.onLine` mocking and dispatched `online`/`offline` events, not by physically disconting a device
- IndexedDB (Dexie queue) → tested against `fake-indexeddb` in unit tests, and against the real browser IndexedDB in Playwright's real browser context (no mocking needed there, since Playwright runs a real browser)
- Service Worker background sync → tested via Playwright's service worker APIs where feasible; genuinely hard-to-simulate cases (app fully closed, OS-level backgrounding) are explicitly deferred to the pre-launch physical QA pass, not blocked on per-feature

## What's required before a `tasks.md` can be signed off
Every feature's tasks.md must specify, per task, which of these apply — not every task needs every layer:
- [ ] Unit tests (Vitest) — for isolated logic (FIFO engine, pricing calculations, validation)
- [ ] Integration tests against real Postgres — for anything touching RLS, SQL functions, or migrations
- [ ] E2E tests (Playwright) — for user-facing flows, with hardware simulated per above
- [ ] Manual QA — only required where explicitly flagged; default is automated coverage is sufficient for sign-off

Pre-launch (once, not per-feature): a dedicated physical QA pass on real warehouse hardware (actual barcode scanners, actual dead-zone/offline conditions, actual Service Worker backgrounding behavior) before go-live.

## Debugging / defect process
Not yet defined — see open item below.

## Open item
Bug-tracking convention (where defects found during testing/QA get logged and how they map back to a spec's tasks.md) is not yet decided. Flag when relevant.
