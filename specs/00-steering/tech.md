# Tech — Hyperion 3PL / Dyna-Serv
Status: Approved (stack) / Draft (principles below still being finalized alongside flagged specs)

## Stack (locked — Option A)
- **Frontend/Backend**: Next.js 15, App Router, Server Actions + API routes
- **Database / ORM**: PostgreSQL via Supabase, accessed via Drizzle ORM for type-safe queries and schema management, with RLS for all party/role scoping
- **Auth**: Supabase Auth, session-based role resolution
- **Email**: Resend (transactional emails, auth signup/login confirmations)
- **Storage**: Supabase Storage (documents, barcode labels)
- **Realtime**: Supabase Realtime (pending-approval queue, notifications)
- **Rate Limiting**: Upstash Redis (`@upstash/ratelimit`) for API & auth rate limiting
- **Error Monitoring**: Sentry for application monitoring & error tracking (client, server, edge)
- **Background jobs**: Redis + BullMQ or Supabase Edge Functions + pg_cron
- **Deployment**: Vercel (app) + Supabase (managed Postgres)
- Full cost/tradeoff comparison against Options B/C/D lives in the system design doc §1.2 — not repeated here.

## Cross-cutting architecture principles (carry into every spec)
- RBAC resolved from session, never from a client-supplied parameter
- Item identity (barcode) is separate from physical placement (location)
- Lot `status` is the single FIFO/FEFO eligibility gate — no per-feature exclusion logic
- One `inventory_transactions` table, differentiated by `movement_type`, not three separate schemas
- Every approval is a recorded decision (identity + timestamp + reason), never a boolean flip
- Pricing is visible everywhere (dashboards, documents, accounting handoff) — Trading price is final, VMI price on a document is a per-release reference only, never the authoritative bill

## Explicitly not yet locked
RBAC role model, offline sync approach, VMI billing model, and Trading pricing model are flagged for major revision (see `revision-log.md`) — specs touching these stay in `Draft` until reconciled.

## Testing
See `testing.md` for the full strategy (Vitest + Playwright, two-stage DB testing, floor/hardware simulation approach). Every `tasks.md` must specify applicable testing layers per task — this is structural, not optional.
