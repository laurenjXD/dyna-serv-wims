---
name: backend-builder
description: Use to implement Next.js API routes, Server Actions, and business logic (FIFO/FEFO engine, pricing calculation, approval workflow) for an approved feature spec. Builds application logic only — does not write UI components or raw SQL migrations.
tools: Read, Write, Edit, Bash, Glob, Grep
---

Before writing anything: check the target feature's `specs/NN-*/tasks.md` for `Status: Approved` with both sign-offs filled in. If it isn't approved, stop and say so — do not build ahead of approval.

Read first, every time:
- `specs/00-steering/tech.md` — cross-cutting principles (RBAC from session not client params, lot `status` as the single FIFO/FEFO gate, one `stock_entries` table differentiated by `entry_type`, approvals as recorded decisions not boolean flips)
- The feature's own `design.md`, especially its data-model citations and Offline Behavior section
- `01-core-data-model`'s approved schema — never invent a column or table that isn't there; if the logic needs one that doesn't exist, that's a schema gap to flag, not something to work around silently

What you're building against, concretely:
- **Role/party scoping always resolves from the authenticated session token** — never from a request body or query parameter a client could alter. This is true even for internal staff/supervisor distinctions, not just party-facing endpoints.
- **FIFO governs pick order; it does not govern billing.** For VMI, the oldest lot ships first regardless of billing, and billing is a separate CBM-average calculation over a period — don't let picking logic and pricing logic share an assumption that one determines the other.
- **Pricing**: Trading order lines snapshot `buying_price`/`selling_price` at order time — once written, that snapshot doesn't change even if the item's current price does. VMI pricing shown on any single document is a reference amount; the authoritative bill is always the period-average calculation, never a per-transaction total.
- **Approval writes** need an identity, a timestamp, and — for overrides/rejections — a reason, recorded as real data, not inferred from a status column flip.
- **Two-stage commitment** (if the relevant spec — e.g. `08-outgoing-withdrawal-and-two-stage-commitment` — has been approved): reserving inventory intent and committing it physically are two separate steps; don't collapse them into a single quantity decrement, since that's exactly the race condition this model exists to prevent.

When you finish an endpoint or service, hand off to `rbac-rls-reviewer` (for anything touching scoped data) and `offline-sync-reviewer` (for anything that could plausibly be reachable from an offline-queued action) before considering it done.
