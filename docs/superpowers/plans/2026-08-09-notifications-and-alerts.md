# Notifications & Alerts (Spec 14) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Track 2's first sprint item — durable in-app notifications and operational threshold alerts (`specs/14-notifications-and-alerts`, `Status: Approved`, all three docs, sign-off complete 2026-08-05) — starting with everything Track 2 can build *without* touching Track-3-locked files, then handing off the schema/migration/RLS work to Track 3 through the documented cross-track request protocol.

**Architecture:** A workflow feature (07/08/09/10/11/13) commits its own transaction and writes a durable outbox event. `14` is a downstream router: it resolves scoped recipients from current RBAC capability + party/flow scope, writes one durable `notifications` row per recipient, and optionally queues a Resend email. The browser never subscribes to a global stream — Realtime publishes a minimal per-user signal only, and the client always refetches the authoritative record. Threshold alerts (low stock, expiry, commitment-overdue) come from a scheduled evaluation job reading approved derived views, never raw tables.

**Tech Stack:** Next.js 15 Server Actions, Drizzle ORM (Postgres), Supabase Auth/RLS/Realtime, Resend (transactional email), Vitest, `db-migration-verifier` for real-Postgres checks.

## Global Constraints

- No application code, migration, or schema file may exist beyond what's already approved — this gate is already satisfied (`tasks.md Status: Approved`, both sign-offs filled) — but **file ownership is a separate, still-binding constraint**: `lib/rbac/*`, `lib/db/schema/*`, `supabase/migrations/*`, and `specs/00-steering/*` are Track-3-locked per `specs/00-steering/multi-agent-work-division.md`. Track 2 (this plan) never writes to those paths directly — schema/migration/RBAC-code changes go through a named request in `specs/00-steering/revision-log.md`'s "Pending cross-track requests" section.
- Every capability string used in `requirePermission()` or RLS must already exist in `specs/02-rbac-roles/design.md` §3.2. `14` needs new ones (`notifications.read`, `notifications.manage_preferences`, `notifications.manage_rules` at minimum) — these must be added to that catalog and seeded via migration before any RLS-gated code can be real-Postgres-verified.
- `14` **never** recalculates business truth it doesn't own: low-stock reads `lot_inventory_totals` (owned by `01`/`16`), never `lot_location_balances` directly (requirements.md R1-A.1, design.md §2).
- All monetary/PII-adjacent fields follow existing project conventions: decimal strings never floats (n/a here — no money in this feature), `withTimezone: true` on every `timestamp`, `uuid().primaryKey().defaultRandom()` for IDs, matching every existing table in `lib/db/schema/*`.
- Notification mutations (send, ack, dismiss, preference/rule change) are Tier 2 online-only (requirements.md §2, design.md §7) — never queued offline.
- Reuse `01`'s existing `audit_log` table (`lib/db/schema/audit.ts`) for the audit trail requirements.md R6.4 demands (routing, suppression, delivery, read/ack/dismiss, preference/rule changes) — do not invent a second, parallel audit table. `entityType: "notification"` / `"notification_preference"` / `"alert_rule"`, `entityId` = the relevant row's UUID.

---

## Phase 0 — Schema & capability proposal (Track 2 executes now; produces the cross-track request, not the migration itself)

This phase produces no `lib/db/schema/*` or `supabase/migrations/*` files directly — those are Track-3-owned. It produces the *exact* text Track 3 needs to copy into those locked files, plus the formal request that hands it to them.

### Task 1: Draft the `notifications` core schema (as a standalone reference file, not committed into `lib/db/schema/`)

**Files:**
- Create: `docs/superpowers/plans/2026-08-09-notifications-schema-draft.md` (the deliverable Track 3 consumes — NOT `lib/db/schema/notifications.ts`, which Track 2 does not have write access to)

**Interfaces:**
- Produces: the exact Drizzle table shapes `lib/notifications/recipient-resolution.ts` (Task 4) and every Phase 2 query module will import types from, once Track 3 lands the real file at the same path/name.

- [ ] **Step 1: Write the draft schema file**

```markdown
# Notifications schema draft — for Track 3 to land at `lib/db/schema/notifications.ts`

Traceability: specs/14-notifications-and-alerts/design.md §3, requirements.md R1/R1-A/R2.

## New enums — add to `lib/db/schema/enums.ts`

\`\`\`typescript
export const notificationCategoryEnum = pgEnum("notification_category", [
  "approval_attention",
  "receiving_exception",
  "transfer_attention",
  "pick_list_readiness",
  "trading_attention",
  "service_job_failure",
  "low_stock",
  "expiry_approaching",
  "lot_depleted",
  "receiving_discrepancy",
  "inspection_failure",
  "commitment_overdue",
  "document_generation_failure",
]);

export const notificationSeverityEnum = pgEnum("notification_severity", [
  "info",
  "warning",
  "critical",
]);

export const notificationLifecycleStatusEnum = pgEnum("notification_lifecycle_status", [
  "pending",
  "delivered",
  "failed",
  "read",
  "acknowledged",
  "expired",
  "dismissed",
]);

export const notificationDeliveryChannelEnum = pgEnum("notification_delivery_channel", [
  "in_app",
  "email",
]);

export const notificationDeliveryStatusEnum = pgEnum("notification_delivery_status", [
  "queued",
  "sent",
  "delivered",
  "failed",
  "dead_letter",
]);

export const alertConditionTypeEnum = pgEnum("alert_condition_type", [
  "threshold",
  "event",
  "schedule",
]);

export const alertRuleScopeEnum = pgEnum("alert_rule_scope", [
  "global",
  "party_scoped",
  "flow_scoped",
]);
\`\`\`

## `notifications` (design.md §3 "notifications")

\`\`\`typescript
import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import {
  notificationCategoryEnum,
  notificationSeverityEnum,
  notificationLifecycleStatusEnum,
  flowTypeEnum,
} from "./enums";
import { parties } from "./parties";

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientUserId: uuid("recipient_user_id").notNull(),
  category: notificationCategoryEnum("category").notNull(),
  severity: notificationSeverityEnum("severity").notNull(),
  status: notificationLifecycleStatusEnum("status").default("pending").notNull(),
  // Safe display text only — never the protected payload itself
  // (design.md §5: "safe display text may be stored, sensitive source
  // payloads should be fetched on demand"). templateVersion lets a
  // future template edit not retroactively rewrite historical rows.
  titleSafe: text("title_safe").notNull(),
  bodySafe: text("body_safe").notNull(),
  templateVersion: text("template_version").notNull(),
  // Source event this notification was created from — for idempotency
  // and for "refetch authoritative source record" (requirements.md R1.5).
  sourceEventId: uuid("source_event_id").notNull(),
  sourceType: text("source_type").notNull(), // e.g. "wrr_documents", "approval_requests"
  sourceId: uuid("source_id").notNull(),
  // Nullable: not every notification is party-scoped (e.g. document_generation_failure is global-admin).
  partyId: uuid("party_id").references(() => parties.id),
  flowType: flowTypeEnum("flow_type"),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
}, (table) => ({
  // Idempotency per requirements.md R1.3: same source event + recipient +
  // template version never creates a second row. Channel is on the
  // notification_deliveries table (a notification can fan out to
  // multiple channels), so this key is deliberately narrower than
  // design.md §4's "(event_id, recipient_id, channel, template_version)"
  // — that composite key is enforced on notification_deliveries instead,
  // where channel actually varies per row.
  recipientEventUnique: uniqueIndex("notifications_recipient_event_unique")
    .on(table.recipientUserId, table.sourceEventId, table.templateVersion),
  recipientUnreadIdx: index("notifications_recipient_status_idx")
    .on(table.recipientUserId, table.status),
  categoryIdx: index("notifications_category_idx").on(table.category),
  createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
}));
\`\`\`

## `notification_deliveries` (design.md §3 "notification_deliveries")

\`\`\`typescript
import { pgTable, uuid, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { notificationDeliveryChannelEnum, notificationDeliveryStatusEnum } from "./enums";
import { notifications } from "./notifications"; // same file, defined above

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  notificationId: uuid("notification_id").references(() => notifications.id).notNull(),
  channel: notificationDeliveryChannelEnum("channel").notNull(),
  status: notificationDeliveryStatusEnum("status").default("queued").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  providerMessageId: text("provider_message_id"),
  // Sanitized only — never raw provider payload (design.md §5: "Logs,
  // errors, provider metadata, and telemetry are redacted").
  lastErrorSafe: text("last_error_safe"),
  queuedAt: timestamp("queued_at", { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
}, (table) => ({
  // The real design.md §4 composite dedup key lives here, where channel
  // genuinely varies per row.
  eventChannelUnique: uniqueIndex("notification_deliveries_idempotency_unique")
    .on(table.notificationId, table.channel, table.idempotencyKey),
}));
\`\`\`

## `notification_preferences` (design.md §3 "notification_preferences")

\`\`\`typescript
import { pgTable, uuid, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { notificationCategoryEnum, notificationDeliveryChannelEnum } from "./enums";

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  category: notificationCategoryEnum("category").notNull(),
  channel: notificationDeliveryChannelEnum("channel").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedByUserId: uuid("updated_by_user_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userCategoryChannelUnique: uniqueIndex("notification_preferences_unique")
    .on(table.userId, table.category, table.channel),
}));
```

**Mandatory-channel enforcement (requirements.md R4.4, design.md §4):** application-layer, not a DB constraint — `critical` severity + certain categories (security, `document_generation_failure`) ignore a `false` preference row entirely. Document this in the query layer (Phase 2 Task 8), not the schema.

## `alert_rules` and `inventory_alert_events` — deferred to a Phase 0b request

Not included in this first request. `requirements.md` §6 leaves "initial alert metrics/events and owning feature for each threshold" and the exact rule-table shape only provisional pending the Product Owner's threshold decisions (reorder-level source, expiry windows, commitment-overdue window, cooldown periods — `requirements.md` §6 last bullet). The seven `R1-A` alert types themselves (low stock, expiry, lot depleted, receiving discrepancy, inspection failure, commitment overdue, document generation failure) are individually well-specified — deferring only the generic *rule administration* table, not the alerts themselves. Phase 2 implements those seven alerts as fixed application logic against the fixed thresholds already stated in `requirements.md` R1-A (24h low-stock cooldown, 30/7-day expiry windows); `alert_rules`/`inventory_alert_events` (for future admin-configurable thresholds) becomes a Phase 3 follow-up once the Product Owner has actually made those calls, per design.md's own "provisional until schema review" framing.

- [ ] **Step 2: Verify the draft is self-contained**

Read the draft file back top to bottom as if you were Track 3 with zero other context. Confirm every `import` line resolves to a real, already-existing path (`./parties`, `drizzle-orm/pg-core`) or another block in the same draft file. Confirm no `TODO`/`TBD` markers exist in the SQL/TypeScript blocks themselves (the prose framing them may say "deferred," but the code blocks that ARE included must be complete).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-09-notifications-schema-draft.md
git commit -m "docs(14): draft notifications schema for Track 3 handoff"
```

### Task 2: Draft the RBAC capability catalog amendment

**Files:**
- Modify: `specs/02-rbac-roles/design.md` §3.2 (Track 2 may edit this directly — it is *not* in the two-track doc's locked-file list, only `specs/00-steering/*` and the `lib/rbac/*`/`supabase/migrations/*` code paths are locked)

**Interfaces:**
- Produces: the exact `(resource, action)` capability strings Task 4's recipient-resolution logic and every later `requirePermission()` call in this feature use. Per `multi-agent-work-division.md`'s "Capability vocabulary" section, no code anywhere may invent a string not listed here first.

- [ ] **Step 1: Read `specs/02-rbac-roles/design.md` §3.2 in full**

Confirm the exact table format already used (resource | action | description columns, then a second role-assignment table) before adding rows — match it exactly, don't invent a new format.

- [ ] **Step 2: Add the new capability catalog rows**

Add to §3.2's operational capability catalog table:

```
| `notifications` | `read` | View your own scoped in-app notifications. |
| `notifications` | `manage_preferences` | Change your own notification channel/category preferences. |
| `notifications` | `manage_rules` | Administer alert-rule thresholds (deferred — see Phase 0b). |
| `notifications` | `read_diagnostics` | View delivery/dead-letter diagnostics without message content. |
```

Add to the role-assignment table:

```
('warehouse_staff', 'notifications', 'read', 'assigned_party'),
('supervisor', 'notifications', 'read', 'assigned_party'),
('supervisor', 'notifications', 'read_diagnostics', 'global'),
('administrator', 'notifications', 'read', 'global'),
('administrator', 'notifications', 'read_diagnostics', 'global'),
('administrator', 'notifications', 'manage_rules', 'global'),
('party_user', 'notifications', 'read', 'assigned_party'),
-- manage_preferences: every authenticated role manages their OWN
-- preferences regardless of other grants — this is a self-scoped
-- capability, not party/flow-scoped. Model as 'global' scope_kind with
-- the query layer additionally filtering `user_id = auth.uid()` (same
-- pattern user_profiles' own-row policies already use).
('warehouse_staff', 'notifications', 'manage_preferences', 'global'),
('supervisor', 'notifications', 'manage_preferences', 'global'),
('administrator', 'notifications', 'manage_preferences', 'global'),
('party_user', 'notifications', 'manage_preferences', 'global'),
```

- [ ] **Step 3: Add a dated amendment paragraph**

Directly beneath the table, following this project's established convention (see the 2026-08-08 "Catalog addition" paragraphs already in `specs/02-rbac-roles/design.md`):

```markdown
**Catalog addition (2026-08-09):** `notifications.read`/`manage_preferences`/
`manage_rules`/`read_diagnostics` originate from `14-notifications-and-alerts`
requirements.md R6.1 and tasks.md Task Group 3's "add notification read/
read-state/preferences/operations capabilities to the canonical RBAC
catalog" item. `read` uses `assigned_party` scope kind (a recipient only
ever sees their own party/flow-scoped notifications, per design.md §5's
authorization intersection); `manage_preferences` uses `global` scope kind
with an application/RLS-layer `user_id = auth.uid()` restriction, since a
user manages only their own preferences regardless of party scope, the
same self-row pattern already used for `user_profiles`.
```

- [ ] **Step 4: Run the existing `02-rbac-roles` test suite to confirm nothing else references a stale row count**

```bash
npx vitest run lib/db/schema/__tests__/rbac.test.ts
```

Expected: PASS (this test file checks schema *shape*, not the spec markdown — it should be unaffected by a doc-only change, confirming you haven't accidentally implied a code change here).

- [ ] **Step 5: Commit**

```bash
git add "specs/02-rbac-roles/design.md"
git commit -m "docs(02,14): add notification capability catalog rows"
```

### Task 3: Open the formal cross-track request

**Files:**
- Modify: `specs/00-steering/multi-agent-work-division.md` (add to a new "## Pending cross-track requests" section if one doesn't exist yet — check first, this doc's current version doesn't have one)
- Modify: `specs/00-steering/revision-log.md` (the doc's own protocol names this file as where the request goes: *"open a named request in revision-log.md under 'Pending cross-track requests'"*)

**Interfaces:**
- Consumes: Task 1's schema draft file path, Task 2's capability catalog diff.
- Produces: nothing code-facing — this is the actual handoff artifact.

- [ ] **Step 1: Check whether `revision-log.md` already has a "Pending cross-track requests" section**

```bash
grep -n "Pending cross-track requests" "specs/00-steering/revision-log.md"
```

If found, add your entry under it. If not found, create the section right after the file's opening paragraph (before the first dated entry), matching the exact heading level (`##`) and the request-entry format the *old* three-track doc used (visible in `multi-agent-work-division.md`'s git history / the archived version) — a numbered/dated block with **Requested by**, **Needed for**, **Blocked files**, **What's needed**, **Track 3 will handle**.

- [ ] **Step 2: Write the request entry**

```markdown
### [OPEN] Track 2 → Track 3: `14-notifications-and-alerts` schema + RBAC capabilities (2026-08-09)

**Requested by:** Track 2
**Needed for:** Spec 14 Phase 2 (durable event routing, RLS-gated queries, notification center UI)
**Blocked files:** `lib/db/schema/notifications.ts` (new), `lib/db/schema/enums.ts` (new enums — see draft), `supabase/migrations/` (new migration — next sequential number), `supabase/migrations/` (RLS policies for the three new tables, default-deny per `02` §7.1's pattern), and the `specs/02-rbac-roles/design.md` §3.2 capability seed migration for the four new `notifications.*` rows (spec text already amended by Track 2, see the 2026-08-09 catalog-addition entry — only the SQL seed migration itself is Track 3's to write).

**What's needed:**
1. Land the three tables and seven enums exactly as drafted in `docs/superpowers/plans/2026-08-09-notifications-schema-draft.md` at `lib/db/schema/notifications.ts` (+ the enum additions merged into the existing `lib/db/schema/enums.ts`), export from `lib/db/schema/index.ts`.
2. Generate + hand-write the migration (the partial unique index / composite dedup key on `notification_deliveries` needs the same hand-written-SQL treatment as `lot_inventory_totals` or `user_party_scopes`' `NULLS NOT DISTINCT` index — `drizzle-kit generate` alone won't produce it correctly for the idempotency-key uniqueness scope).
3. RLS: default-deny on all three tables. `notifications` SELECT: `recipient_user_id = auth.uid()`. `notification_deliveries` SELECT: join to `notifications` and same recipient check, OR `notifications.read_diagnostics` capability for the admin diagnostics view. `notification_preferences` SELECT/UPDATE: `user_id = auth.uid()`. No client-side INSERT/UPDATE grants on `notifications` or `notification_deliveries` at all — those are service-role-only (the router writes them, never a browser session).
4. Seed the four `notifications.*` capability rows into `permissions`/`role_permissions` per Task 2's already-amended `02` design.md text.
5. Run `db-migration-verifier` (real Postgres, not mocked) before announcing done, per this project's standing rule.

**Track 3 will handle:** migration authorship, RLS policy authorship, `db-migration-verifier` pass, announcement in this same log entry (`[RESOLVED]` + commit SHA) when landed.
```

- [ ] **Step 3: Commit**

```bash
git add "specs/00-steering/revision-log.md" "specs/00-steering/multi-agent-work-division.md"
git commit -m "docs(14): open cross-track schema request to Track 3"
```

- [ ] **Step 4: Tell Lauren directly** (not just committed text) that this request is open and needs Track 3/Jaime's attention — the written record satisfies the process, but per this project's own git-workflow section, a cross-track dependency should also be raised in conversation, not left to be discovered by accident.

---

## Phase 1 — Pure-logic modules Track 2 can build and fully unit-test right now (zero dependency on Phase 0 landing)

These three modules contain the actual business logic requirements.md and design.md most care about getting right (recipient scoping, dedup, redaction) — and none of them need a real database. They take typed inputs, return typed outputs, and get wired to real queries in Phase 2 once the schema exists. This is the same "write and unit-test against the interface now, real-Postgres-verify later" pattern this project already used for Track 2/3 during the RBAC guard-contract-stable unlock.

### Task 4: Recipient resolution (design.md §5's authorization intersection)

**Files:**
- Create: `lib/notifications/recipient-resolution.ts`
- Test: `lib/notifications/__tests__/recipient-resolution.test.ts`

**Interfaces:**
- Consumes: `Grant`, `PartyScope`, `AuthorizationContext` from `@/lib/rbac/session` (already real, already stable — these types are not part of the Phase 0 request).
- Produces: `resolveRecipients(candidates: RecipientCandidate[], event: NotificationSourceEvent): ResolvedRecipient[]` — consumed directly by Phase 2 Task 8's event router with no signature change expected.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/notifications/__tests__/recipient-resolution.test.ts
import { describe, expect, it } from "vitest";
import { resolveRecipients } from "../recipient-resolution";
import type { RecipientCandidate, NotificationSourceEvent } from "../recipient-resolution";

describe("resolveRecipients (design.md §5 authorization intersection)", () => {
  it("includes a candidate whose grant matches the event's required capability and whose party scope matches", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "receiving", action: "view" },
      partyId: "party-1",
      flowType: "vmi",
    };
    const candidates: RecipientCandidate[] = [
      {
        userId: "user-1",
        grants: [{ resource: "receiving", action: "view", scopeKind: "assigned_party" }],
        partyScopes: [{ partyId: "party-1", flowType: "vmi" }],
      },
    ];

    const result = resolveRecipients(candidates, event);

    expect(result).toEqual([{ userId: "user-1" }]);
  });

  it("excludes a candidate with the right capability but the wrong party scope", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "receiving", action: "view" },
      partyId: "party-1",
      flowType: "vmi",
    };
    const candidates: RecipientCandidate[] = [
      {
        userId: "user-2",
        grants: [{ resource: "receiving", action: "view", scopeKind: "assigned_party" }],
        partyScopes: [{ partyId: "party-2", flowType: "vmi" }],
      },
    ];

    expect(resolveRecipients(candidates, event)).toEqual([]);
  });

  it("includes a global-scope grant holder regardless of the event's party/flow, since global scope has no party restriction", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "inspection", action: "resolve" },
      partyId: null,
      flowType: null,
    };
    const candidates: RecipientCandidate[] = [
      {
        userId: "user-3",
        grants: [{ resource: "inspection", action: "resolve", scopeKind: "global" }],
        partyScopes: [],
      },
    ];

    expect(resolveRecipients(candidates, event)).toEqual([{ userId: "user-3" }]);
  });

  it("excludes a candidate who lacks the required capability entirely, even with a matching party scope", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "inspection", action: "resolve" },
      partyId: "party-1",
      flowType: null,
    };
    const candidates: RecipientCandidate[] = [
      {
        userId: "user-4",
        grants: [{ resource: "receiving", action: "view", scopeKind: "global" }],
        partyScopes: [{ partyId: "party-1", flowType: null }],
      },
    ];

    expect(resolveRecipients(candidates, event)).toEqual([]);
  });

  it("deduplicates a candidate appearing twice in the input list", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "receiving", action: "view" },
      partyId: null,
      flowType: null,
    };
    const candidate: RecipientCandidate = {
      userId: "user-5",
      grants: [{ resource: "receiving", action: "view", scopeKind: "global" }],
      partyScopes: [],
    };

    expect(resolveRecipients([candidate, candidate], event)).toEqual([{ userId: "user-5" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/notifications/__tests__/recipient-resolution.test.ts`
Expected: FAIL with "Cannot find module '../recipient-resolution'"

- [ ] **Step 3: Write the implementation**

```typescript
// lib/notifications/recipient-resolution.ts
//
// Traceability: specs/14-notifications-and-alerts/design.md §5
// (authorization intersection: active capability + matching resource/
// action + matching party scope + matching optional flow_type scope).
// requirements.md R2.2/R2.3.
//
// Pure logic, no DB access — event producers (Phase 2) supply the
// candidate list (queried from user_roles/role_permissions/
// user_party_scopes, the same tables lib/auth/page-resolver.ts already
// reads) and this module decides who's actually authorized to receive
// the notification.

export interface RecipientCandidate {
  userId: string;
  grants: ReadonlyArray<{ resource: string; action: string; scopeKind: "global" | "assigned_party" }>;
  partyScopes: ReadonlyArray<{ partyId: string; flowType: "vmi" | "trading" | "supplies" | null }>;
}

export interface NotificationSourceEvent {
  requiredCapability: { resource: string; action: string };
  // null = a global/unscoped event (e.g. document_generation_failure);
  // a candidate's own scope kind still governs whether they qualify.
  partyId: string | null;
  flowType: "vmi" | "trading" | "supplies" | null;
}

export interface ResolvedRecipient {
  userId: string;
}

function hasRequiredCapability(
  candidate: RecipientCandidate,
  required: { resource: string; action: string },
): ReadonlyArray<RecipientCandidate["grants"][number]> {
  return candidate.grants.filter(
    (g) => g.resource === required.resource && g.action === required.action,
  );
}

function partyScopeMatches(
  candidate: RecipientCandidate,
  event: NotificationSourceEvent,
): boolean {
  if (event.partyId === null) return true; // global event — no party restriction to check
  return candidate.partyScopes.some(
    (scope) =>
      scope.partyId === event.partyId &&
      (scope.flowType === null || scope.flowType === event.flowType),
  );
}

export function resolveRecipients(
  candidates: ReadonlyArray<RecipientCandidate>,
  event: NotificationSourceEvent,
): ResolvedRecipient[] {
  const seen = new Set<string>();
  const result: ResolvedRecipient[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.userId)) continue;

    const matchingGrants = hasRequiredCapability(candidate, event.requiredCapability);
    if (matchingGrants.length === 0) continue;

    const hasGlobalGrant = matchingGrants.some((g) => g.scopeKind === "global");
    const qualifies = hasGlobalGrant || partyScopeMatches(candidate, event);
    if (!qualifies) continue;

    seen.add(candidate.userId);
    result.push({ userId: candidate.userId });
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/notifications/__tests__/recipient-resolution.test.ts`
Expected: PASS, 5/5

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/recipient-resolution.ts lib/notifications/__tests__/recipient-resolution.test.ts
git commit -m "feat(14): add pure recipient-resolution logic"
```

### Task 5: Idempotency key and cooldown-window logic (design.md §4, §9)

**Files:**
- Create: `lib/notifications/dedup.ts`
- Test: `lib/notifications/__tests__/dedup.test.ts`

**Interfaces:**
- Consumes: nothing external — pure functions over plain values and `Date`.
- Produces: `buildIdempotencyKey(...)` and `isWithinCooldown(...)`, consumed by Phase 2 Task 8's router before every insert attempt.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/notifications/__tests__/dedup.test.ts
import { describe, expect, it } from "vitest";
import { buildIdempotencyKey, isWithinCooldown } from "../dedup";

describe("buildIdempotencyKey (design.md §4 composite dedup key)", () => {
  it("produces the same key for the same (eventId, recipientId, channel, templateVersion)", () => {
    const a = buildIdempotencyKey({
      eventId: "evt-1",
      recipientId: "user-1",
      channel: "email",
      templateVersion: "v1",
    });
    const b = buildIdempotencyKey({
      eventId: "evt-1",
      recipientId: "user-1",
      channel: "email",
      templateVersion: "v1",
    });
    expect(a).toBe(b);
  });

  it("produces a different key when any one input differs", () => {
    const base = { eventId: "evt-1", recipientId: "user-1", channel: "email" as const, templateVersion: "v1" };
    const key = buildIdempotencyKey(base);
    expect(buildIdempotencyKey({ ...base, channel: "in_app" })).not.toBe(key);
    expect(buildIdempotencyKey({ ...base, recipientId: "user-2" })).not.toBe(key);
    expect(buildIdempotencyKey({ ...base, templateVersion: "v2" })).not.toBe(key);
  });
});

describe("isWithinCooldown (design.md §9 cooldown/deduplication)", () => {
  it("returns true when the last alert fired inside the cooldown window", () => {
    const now = new Date("2026-08-09T12:00:00Z");
    const lastFiredAt = new Date("2026-08-09T06:00:00Z"); // 6 hours ago
    expect(isWithinCooldown({ lastFiredAt, now, cooldownHours: 24 })).toBe(true);
  });

  it("returns false once the cooldown window has fully elapsed", () => {
    const now = new Date("2026-08-09T12:00:00Z");
    const lastFiredAt = new Date("2026-08-08T11:00:00Z"); // 25 hours ago
    expect(isWithinCooldown({ lastFiredAt, now, cooldownHours: 24 })).toBe(false);
  });

  it("returns false when there is no prior firing at all (null lastFiredAt)", () => {
    const now = new Date("2026-08-09T12:00:00Z");
    expect(isWithinCooldown({ lastFiredAt: null, now, cooldownHours: 24 })).toBe(false);
  });

  it("treats the exact cooldown boundary as no longer within cooldown", () => {
    const now = new Date("2026-08-09T12:00:00Z");
    const lastFiredAt = new Date("2026-08-08T12:00:00Z"); // exactly 24 hours ago
    expect(isWithinCooldown({ lastFiredAt, now, cooldownHours: 24 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/notifications/__tests__/dedup.test.ts`
Expected: FAIL with "Cannot find module '../dedup'"

- [ ] **Step 3: Write the implementation**

```typescript
// lib/notifications/dedup.ts
//
// Traceability: specs/14-notifications-and-alerts/design.md §4 ("A unique
// key such as (event_id, recipient_id, channel, template_version)
// prevents duplicate effects") and §9 ("a low-stock alert for the same
// item suppresses duplicate firings for the configured cooldown period").

export function buildIdempotencyKey(input: {
  eventId: string;
  recipientId: string;
  channel: "in_app" | "email";
  templateVersion: string;
}): string {
  return [input.eventId, input.recipientId, input.channel, input.templateVersion].join(":");
}

export function isWithinCooldown(input: {
  lastFiredAt: Date | null;
  now: Date;
  cooldownHours: number;
}): boolean {
  if (input.lastFiredAt === null) return false;
  const elapsedMs = input.now.getTime() - input.lastFiredAt.getTime();
  const cooldownMs = input.cooldownHours * 60 * 60 * 1000;
  return elapsedMs < cooldownMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/notifications/__tests__/dedup.test.ts`
Expected: PASS, 4/4

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/dedup.ts lib/notifications/__tests__/dedup.test.ts
git commit -m "feat(14): add idempotency-key and cooldown-window logic"
```

### Task 6: Safe template projection (design.md §5's redaction rule)

**Files:**
- Create: `lib/notifications/templates.ts`
- Test: `lib/notifications/__tests__/templates.test.ts`

**Interfaces:**
- Consumes: nothing external.
- Produces: `projectSafeTemplate(raw: RawTemplateInput, audience: "internal" | "party_safe"): SafeTemplateOutput`, consumed by Phase 2 Task 8's router immediately before writing `titleSafe`/`bodySafe` to a `notifications` row, and by Phase 2's email-template rendering.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/notifications/__tests__/templates.test.ts
import { describe, expect, it } from "vitest";
import { projectSafeTemplate } from "../templates";
import type { RawTemplateInput } from "../templates";

describe("projectSafeTemplate (design.md §5: separate internal and party-safe templates)", () => {
  const raw: RawTemplateInput = {
    itemCode: "ITM-001",
    itemName: "Widget A",
    quantity: 12,
    unitCost: "45.50",
    marginPercent: "22.3",
    partyName: "Acme Corp",
  };

  it("includes cost/margin fields for the internal audience", () => {
    const result = projectSafeTemplate(raw, "internal");
    expect(result.body).toContain("45.50");
    expect(result.body).toContain("22.3");
  });

  it("excludes cost/margin fields entirely for the party-safe audience, never nulls them", () => {
    const result = projectSafeTemplate(raw, "party_safe");
    expect(result.body).not.toContain("45.50");
    expect(result.body).not.toContain("22.3");
    expect(result.body).not.toMatch(/unitCost/i);
    expect(result.body).not.toMatch(/marginPercent/i);
  });

  it("includes item identity and quantity for both audiences", () => {
    const internal = projectSafeTemplate(raw, "internal");
    const partySafe = projectSafeTemplate(raw, "party_safe");
    for (const result of [internal, partySafe]) {
      expect(result.body).toContain("ITM-001");
      expect(result.body).toContain("Widget A");
      expect(result.body).toContain("12");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/notifications/__tests__/templates.test.ts`
Expected: FAIL with "Cannot find module '../templates'"

- [ ] **Step 3: Write the implementation**

```typescript
// lib/notifications/templates.ts
//
// Traceability: specs/14-notifications-and-alerts/design.md §5 ("Separate
// internal and party-safe templates prevent Trading cost/margin, VMI
// internal billing data, inspection evidence, or unrelated party
// information from leaking") and §5 more broadly ("safe display text may
// be stored, sensitive source payloads should be fetched on demand").
//
// Cost/margin fields are OMITTED for party_safe audience, never rendered
// as null/blank — matching this project's established financial-
// projection pattern (01 design.md §3 item 4, 16 FR-2.4).

export interface RawTemplateInput {
  itemCode: string;
  itemName: string;
  quantity: number;
  unitCost?: string;
  marginPercent?: string;
  partyName?: string;
}

export interface SafeTemplateOutput {
  body: string;
}

export function projectSafeTemplate(
  raw: RawTemplateInput,
  audience: "internal" | "party_safe",
): SafeTemplateOutput {
  const lines = [`Item ${raw.itemCode} (${raw.itemName}) — quantity ${raw.quantity}.`];

  if (audience === "internal") {
    if (raw.unitCost) lines.push(`Unit cost: ${raw.unitCost}.`);
    if (raw.marginPercent) lines.push(`Margin: ${raw.marginPercent}%.`);
  }

  if (raw.partyName) lines.push(`Party: ${raw.partyName}.`);

  return { body: lines.join(" ") };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/notifications/__tests__/templates.test.ts`
Expected: PASS, 3/3

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/templates.ts lib/notifications/__tests__/templates.test.ts
git commit -m "feat(14): add safe-template projection logic"
```

### Task 7: Run the full suite and confirm Phase 1 is clean before moving on

- [ ] **Step 1: Full verification**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: every existing test still passes, plus the 12 new tests from Tasks 4-6 (5 + 4 + 3); `tsc --noEmit` clean.

- [ ] **Step 2: Commit if anything is still unstaged**

```bash
git status --porcelain
```

Expected: clean (everything already committed per-task above).

---

## Phase 2 — Blocked on Phase 0's cross-track request landing (Track 3 delivers `lib/db/schema/notifications.ts`, the migration, and RLS)

**Do not start Phase 2 tasks until Track 3 announces `[RESOLVED]` on the Task 3 request in `revision-log.md`.** Once it lands, write a follow-up plan (`docs/superpowers/plans/<date>-notifications-phase-2.md`) at the same bite-sized detail level as Phase 1, now that the real schema's exact column/type shape is known (Track 3 may reasonably deviate slightly from the draft during their own real-Postgres verification pass — e.g. an index name or a `NULLS NOT DISTINCT` detail — and this plan should not lock in details the schema owner hasn't confirmed yet).

Phase 2 covers, at the task-list level (not yet code-level):

- **Event intake wiring** — consume `04`'s outbox/job contract. **Second blocking dependency, flag this explicitly to Lauren before starting**: `04-services-and-infrastructure`'s outbox/job/Resend infrastructure does not exist in code yet either (confirmed: no `lib/*outbox*`, `*resend*`, or `app/api/cron/*` files exist in this repo as of 2026-08-09) — it's Track 3's own "After" phase item, not yet started. Phase 2's email-delivery and durable-outbox tasks cannot be real-Postgres/integration-verified until that infrastructure exists, independent of whether the `14`-specific schema request has landed. The in-app (non-email) path and the threshold-alert evaluation job can likely proceed without it, using a direct Drizzle write inside the source feature's own commit transaction rather than a true outbox — confirm this sequencing with Lauren/Track 3 rather than assuming.
- **Query layer** — `lib/db/queries/notifications.ts`: `listNotificationsForUser`, `markRead`, `acknowledge`, `dismiss`, `getPreferences`, `updatePreference`.
- **Server actions** — `lib/actions/notifications.ts`, following the exact `requirePermission()`-first pattern every other action file in this repo already uses (see `lib/actions/withdrawals.ts`, `lib/actions/transfers.ts` for the established shape).
- **RLS real-Postgres verification** — Track 3/`db-migration-verifier`'s job per the cross-track request; Track 2 does not self-verify Track 3's migration.
- **Threshold alert evaluation job** — the seven `R1-A` alerts, each reading its approved source (never raw `lot_location_balances`) and calling Task 4/5/6's already-tested pure logic.
- **Notification center UI** — shell badge + list/detail, following `05`'s Shared Table-Action and Filter/Search Contract (§8) design.md §1 already requires this feature to consume.
- **Realtime scoped channel + polling fallback** — per design.md §6.
- **Resend email adapter wiring** — per design.md §4, blocked on the same `04` infrastructure gap noted above.
- **End-to-end verification** — `tasks.md` §7's full checklist.

---

## Self-Review

**Spec coverage:** `requirements.md` R1 (durable records) → Phase 0 Task 1's schema draft. R1-A (threshold alerts) → Phase 2's evaluation-job task list, explicitly deferring only the generic `alert_rules` admin table per the Product Owner's own still-open §6 decisions, not the alerts themselves. R2 (event intake/routing) → Task 4 (recipient resolution) now, Phase 2 event-intake wiring later. R3 (in-app center) → Phase 2 UI task. R4 (email) → Phase 2, explicitly flagged as blocked on `04` infrastructure that doesn't exist yet. R5 (alert evaluation/ack) → Task 5 (cooldown) now, Phase 2 evaluation job later. R6 (security/privacy/audit) → Task 2 (capability catalog), Task 6 (safe templates), and the Global Constraints section's `audit_log` reuse decision.

**Placeholder scan:** every code block in Tasks 1-6 is complete, real, and directly runnable — no `TODO`/`TBD` inside any code block. Phase 2 is deliberately described at task-list granularity, not code-level, with an explicit stated reason (two real external blocking dependencies) rather than a bare "TBD" — this is a scope boundary, not an unfilled placeholder, per the same logic the skill's own "Scope Check" section endorses for multi-subsystem specs.

**Type consistency:** `RecipientCandidate`/`NotificationSourceEvent`/`ResolvedRecipient` (Task 4) are self-contained and don't collide with any later Phase 2 type. `buildIdempotencyKey`'s `channel: "in_app" | "email"` matches `notificationDeliveryChannelEnum`'s two values exactly (Task 1's draft schema). `projectSafeTemplate`'s `audience: "internal" | "party_safe"` matches design.md §5's own two named template variants. No signature drift found.
