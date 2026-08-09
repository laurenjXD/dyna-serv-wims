// `/sync` — Sync & Offline Queue: conflict review surface.
//
// Traceability:
//   specs/03-offline-mode-and-client-storage/design.md §6.6 (supervisor
//     conflict resolution surface), §9.1 (sync conflict badge, alerts feed),
//     §6.3 step 5b (failed entries surfaced to supervisor), §4.5 (outbox
//     status enum: pending, syncing, failed, quarantined_actor_mismatch).
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation:
//     bg-surface-white), §2 (typography), §9 (office buttons h-11).
//
// Surface: Office (conflict review is a supervisor/admin surface per design.md
//   §6.6 — floor users see only the shell banner pointing here).
// Capability gate: none (capability: "none" per registry — route visible to
//   any authenticated user; conflict entries themselves are scoped to the
//   current session user's outbox by the offline coordinator on the client).
// Offline: read-only from cache per design.md §9.2 (Sync Conflicts row).
//
// TODO: wire status banner to OfflineStatus context from lib/offline.
// TODO: wire failed/syncing/completed entries to IndexedDB outbox via
//   lib/offline — this page currently renders mock data only.

import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";

// ─── Types ────────────────────────────────────────────────────────────────────

type FailedEntryReason =
  | "Authorization rejected"
  | "Conflict"
  | "Permanent failure";

interface FailedEntry {
  id: string;
  operationType: string;
  operationLabel: string;
  failedAt: string;
  reason: FailedEntryReason;
  dataSnapshot: string;
}

// ─── Reason badge helpers ─────────────────────────────────────────────────────
// design-system §1.3: status-held (red) for failed/rejected, status-pending
// (amber) for conflict, status-neutral for other.

const REASON_CLASSES: Record<FailedEntryReason, string> = {
  "Authorization rejected": "bg-status-held/10 text-status-held",
  Conflict: "bg-status-pending/10 text-status-pending",
  "Permanent failure": "bg-status-held/10 text-status-held",
};

// ─── Mock data ────────────────────────────────────────────────────────────────
// TODO: wire to offline queue attention records from IndexedDB (lib/offline).
// Retention: failed/quarantined/attention entries kept 30 days per design.md §4.5.

const MOCK_FAILED_ENTRIES: FailedEntry[] = [
  {
    id: "sync-fail-001",
    operationType: "receiving_scan_observation",
    operationLabel: "WRR Scan Capture",
    failedAt: "12 minutes ago",
    reason: "Conflict",
    dataSnapshot:
      'wrr_id: "a1b2…", wrr_item_id: "c3d4…", scanned_qty: 12, location_id: "LOC-A3"',
  },
  {
    id: "sync-fail-002",
    operationType: "pick_list_scan_observation",
    operationLabel: "Pick List Scan",
    failedAt: "1 hour ago",
    reason: "Authorization rejected",
    dataSnapshot:
      'pick_list_id: "e5f6…", pick_list_item_id: "g7h8…", scanned_qty: 5, location_id: "LOC-B1"',
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SyncPage({ searchParams }: PageProps) {
  const { tab: tabParam } = await searchParams;

  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();

  // Auth check — capability: "none" route, but still requires authenticated session.
  // AuthenticatedShellBoundary handles the real redirect; this is the server guard.
  if (resolution.kind !== "authorized") {
    return null;
  }

  const activeTab =
    tabParam === "syncing"
      ? "syncing"
      : tabParam === "completed"
        ? "completed"
        : "failed";

  return (
    <div className="mx-auto max-w-container">
      {/* Page header — Fira Sans Bold, headline-xl per brand-design-system.md §2 */}
      <div>
        <h1 className="font-heading font-bold text-headline-xl text-brand-navy">
          Sync &amp; Offline Queue
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Review failed and pending offline operations that need manual
          resolution.
        </p>
      </div>

      {/* ── Connectivity status banner ──────────────────────────────────────────
          Static "Connected" placeholder — green success banner.
          TODO: wire to OfflineStatus context from lib/offline (ConnectivityStatus,
          SyncStatus per design.md §9.0). Show amber "Offline" state when
          connectivity === "offline", blue spinner when sync === "syncing". */}
      <div className="mt-6 flex items-center gap-3 rounded-xl border-l-4 border-status-available bg-status-available/10 px-4 py-3">
        <CheckCircle2
          size={20}
          className="shrink-0 text-status-available"
          aria-hidden="true"
        />
        <span className="font-body text-body-md text-on-surface">
          Connected &mdash; all changes synced.
        </span>
      </div>

      {/* ── Tab navigation ─────────────────────────────────────────────────────
          URL-based tab switching — no JS required (Server Component). */}
      <div className="mt-6 flex gap-1 border-b border-outline-variant/30">
        <Link
          href="/sync?tab=failed"
          className={`flex h-11 items-center gap-2 px-4 font-label text-label motion-safe:transition-colors motion-safe:duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "failed"
              ? "border-b-2 border-brand-navy text-brand-navy"
              : "text-text-grey hover:text-on-surface"
          }`}
          aria-current={activeTab === "failed" ? "page" : undefined}
        >
          <XCircle size={16} aria-hidden="true" />
          Failed
          {/* Attention count badge — shown when there are failed entries */}
          {MOCK_FAILED_ENTRIES.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-status-held/10 px-1.5 font-label text-label text-status-held uppercase">
              {MOCK_FAILED_ENTRIES.length}
            </span>
          )}
        </Link>
        <Link
          href="/sync?tab=syncing"
          className={`flex h-11 items-center gap-2 px-4 font-label text-label motion-safe:transition-colors motion-safe:duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "syncing"
              ? "border-b-2 border-brand-navy text-brand-navy"
              : "text-text-grey hover:text-on-surface"
          }`}
          aria-current={activeTab === "syncing" ? "page" : undefined}
        >
          <Loader2 size={16} aria-hidden="true" />
          Syncing
        </Link>
        <Link
          href="/sync?tab=completed"
          className={`flex h-11 items-center gap-2 px-4 font-label text-label motion-safe:transition-colors motion-safe:duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "completed"
              ? "border-b-2 border-brand-navy text-brand-navy"
              : "text-text-grey hover:text-on-surface"
          }`}
          aria-current={activeTab === "completed" ? "page" : undefined}
        >
          <CheckCircle2 size={16} aria-hidden="true" />
          Completed
        </Link>
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <div className="mt-4">
        {activeTab === "failed" && <FailedTab entries={MOCK_FAILED_ENTRIES} />}
        {activeTab === "syncing" && <SyncingTab />}
        {activeTab === "completed" && <CompletedTab />}
      </div>
    </div>
  );
}

// ─── Failed tab ───────────────────────────────────────────────────────────────
//
// Each failed entry card: Level 1 glassmorphism elevation per §6.
// Buttons: h-11 (44px) office touch targets, active: press feedback.
// design.md §6.6: supervisor may accept server-side winner or escalate.
// design.md §4.5: no auto-merge permitted under any conflict class.

function FailedTab({ entries }: { entries: FailedEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <CheckCircle2
          size={40}
          className="text-status-available"
          aria-hidden="true"
        />
        <p className="font-body text-body-md text-status-available">
          No failed operations
        </p>
        <p className="font-body text-body-sm text-text-grey">
          All queued operations have synced successfully.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <FailedEntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function FailedEntryCard({ entry }: { entry: FailedEntry }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
      {/* Card header row: operation badge + time */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Operation type badge — Epilogue SemiBold uppercase */}
        <span className="inline-flex items-center rounded-full bg-brand-navy/10 px-3 py-1 font-label text-label uppercase tracking-[0.05em] text-brand-navy">
          {entry.operationLabel}
        </span>
        {/* Relative time */}
        <span className="font-body text-body-sm text-text-grey">
          Failed {entry.failedAt}
        </span>
      </div>

      {/* Error reason badge */}
      <div className="mt-3 flex items-center gap-2">
        <AlertTriangle
          size={16}
          className="shrink-0 text-status-held"
          aria-hidden="true"
        />
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${REASON_CLASSES[entry.reason]}`}
        >
          {entry.reason}
        </span>
      </div>

      {/* Data snapshot — Roboto Mono for codes/IDs per §9 */}
      <div className="mt-3 rounded-lg bg-surface-light-grey px-3 py-2">
        <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
          Captured data (truncated)
        </p>
        <p className="mt-1 font-mono text-mono-md text-on-surface">
          {entry.dataSnapshot}
        </p>
      </div>

      {/* Action buttons — h-11 (44px) office targets, active: press feedback */}
      {/* TODO: wire Retry to sync coordinator retry action (lib/offline) */}
      {/* TODO: wire Discard to outbox entry discard server action */}
      {/* design.md §6.6: supervisor may accept server-side winner (Discard)
          or escalate. No auto-merge of quantities or inventory facts. */}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="flex h-11 items-center gap-2 rounded bg-brand-navy px-4 font-label text-label text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97]"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Retry
        </button>
        <button
          type="button"
          className="flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-status-held focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97]"
        >
          <XCircle size={16} aria-hidden="true" />
          Discard
        </button>
      </div>
    </div>
  );
}

// ─── Syncing tab ──────────────────────────────────────────────────────────────
// TODO: wire to outbox entries with status === "syncing" from IndexedDB.

function SyncingTab() {
  // Mock: no in-progress entries currently.
  const inProgressEntries: unknown[] = [];
  // TODO: replace with real in-progress outbox entries from lib/offline

  if (inProgressEntries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <Loader2
          size={40}
          className="text-status-neutral"
          aria-hidden="true"
        />
        <p className="font-body text-body-md text-text-grey">
          Nothing currently syncing.
        </p>
        <p className="font-body text-body-sm text-text-grey">
          In-progress sync operations will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* TODO: map over in-progress entries */}
    </div>
  );
}

// ─── Completed tab ────────────────────────────────────────────────────────────
// design.md §4.5: completed entries expire after 24 hours.
// TODO: wire to sync_log entries with outcome === "applied" from IndexedDB.

function CompletedTab() {
  // Mock: no completed entries in this session.
  const completedEntries: unknown[] = [];
  // TODO: replace with real completed sync_log entries from lib/offline

  return (
    <div>
      <p className="mb-3 font-body text-body-sm text-text-grey">
        Completed entries expire after 24 hours.
      </p>
      {completedEntries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
          <CheckCircle2
            size={40}
            className="text-status-available"
            aria-hidden="true"
          />
          <p className="font-body text-body-md text-text-grey">
            No completed operations in this session.
          </p>
          <p className="font-body text-body-sm text-text-grey">
            Successfully synced operations appear here until they expire.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* TODO: map over completed sync_log entries */}
        </div>
      )}
    </div>
  );
}
