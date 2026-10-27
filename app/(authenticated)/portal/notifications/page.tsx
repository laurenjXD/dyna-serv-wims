// `/portal/notifications` — Party Portal: Notification center.
//
// Traceability:
//   specs/22-parties-portal/design.md §3 (route inventory: /portal/notifications,
//     capability notifications.read), §4 (notifications.read is NOT a new
//     catalog addition — both the global and assigned_party rows already
//     existed before this feature; see specs/02-rbac-roles/design.md's
//     2026-08-09 catalog-addition note), §8 (no offline caching).
//   specs/14-notifications-and-alerts/design.md §3 (logical model —
//     notifications table shape: category, severity, title/body_safe,
//     source_type/source_id, read_at/acknowledged_at/dismissed_at), §6
//     (client/shell behavior — office views get filtering + bulk read/dismiss;
//     mobile/floor views get large touch targets and severity icons).
//   specs/00-steering/brand-design-system.md §1.1a (colored left-accent bar
//     signature pattern), §1.3 (status colors, never color-alone), §6 (office
//     Level 1 elevation), §9 (office table/card pattern).
//
// Surface: Party (office-style presentation per design.md §3.3).
// Capability gate: notifications.read, scoped to the caller's own party.
//   Unlike vmi_statements.read/reporting.read/shipment_labels.generate, this
//   capability is NOT blocked on a pending 02 catalog addition — per
//   specs/02-rbac-roles/design.md's 2026-08-09 note, both the global and
//   assigned_party notifications.read rows already existed in the approved
//   catalog before that amendment. What's still missing is 14's actual
//   `notifications` table (specs/14-notifications-and-alerts/design.md §3 —
//   "provisional until the schema review") — this page is a UI shell over
//   that not-yet-built data layer, same pattern as /reports, /documents, and
//   /billing-pricing.
// Offline: no offline caching — every load is a fresh authoritative read
//   (design.md §9 Offline/Realtime/audit boundaries).
// TODO: wire to the `notifications` table query once 14's schema lands.
//   Filter/mark-read/mark-all-read actions below are presentational only —
//   no server action exists yet for notification state mutation.

import { Bell, AlertTriangle, Info, CheckCircle2 } from "@/components/ui/icons";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { resolveActivePartyScope } from "@/lib/portal/resolve-party-scope";
import { listRecentNotifications } from "@/lib/db/queries/notifications";
import { MarkAllNotificationsReadButton } from "./MarkAllNotificationsReadButton";

// ─── Types ────────────────────────────────────────────────────────────────────
// Field shape mirrors specs/14-notifications-and-alerts/design.md §3's
// provisional `notifications` table (category, severity, title/body_safe,
// created_at, read_at) — provisional until 14's own schema review lands.

type Severity = "critical" | "warning" | "info";

interface NotificationRow {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

// ─── Severity helpers — tokens from tailwind.config.ts, never raw hex ─────────
// brand-design-system.md §1.3: status is never color-alone — every severity
// pairs its color with an icon (§1.3, §9's "Status badges/pills" rule).

const SEVERITY_ICON: Record<Severity, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_CLASSES: Record<Severity, { border: string; icon: string; badge: string }> = {
  critical: {
    border: "border-status-held/40 bg-status-held/5",
    icon: "text-status-held",
    badge: "bg-status-held/10 text-status-held",
  },
  warning: {
    border: "border-status-pending/40 bg-status-pending/5",
    icon: "text-status-pending",
    badge: "bg-status-pending/10 text-status-pending",
  },
  info: {
    border: "border-border/60 bg-surface-white",
    icon: "text-brand-navy",
    badge: "bg-brand-navy/10 text-brand-navy",
  },
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function PortalNotificationsPage({ searchParams }: PageProps) {
  const { filter: filterParam } = await searchParams;

  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();

  if (resolution.kind !== "authorized") {
    return <PermissionDenied />;
  }

  const partyScope = resolveActivePartyScope(resolution.context);
  if (!partyScope) {
    return <NoPartyScope />;
  }

  // Notifications span every category/flow for the party (not VMI- or
  // Trading-specific), so a null scope flowType matches either, same
  // reasoning documents/page.tsx uses for its own notifications.read-adjacent
  // documents.read gate.
  const permResult = await requirePermission(resolver, "notifications.read", {
    partyId: partyScope.partyId,
    flowType: partyScope.flowType ?? "vmi",
  });

  if (permResult.kind !== "authorized") {
    return <PermissionDenied />;
  }

  const activeFilter = filterParam === "unread" ? "unread" : "all";
  let notificationsLoadFailed = false;
  const notificationRows = await listRecentNotifications(resolution.context.userId, 100).catch(() => {
    notificationsLoadFailed = true;
    return [];
  });
  const allRows: NotificationRow[] = notificationRows.map((row) => ({
    id: row.id,
    category: row.category,
    severity: "info",
    title: row.title,
    body: row.body ?? "",
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  }));
  const rows = activeFilter === "unread" ? allRows.filter((row) => row.readAt === null) : allRows;
  const unreadCount = allRows.filter((row) => row.readAt === null).length;

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
            Notifications
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Alerts and updates for your account.
          </p>
        </div>
        <MarkAllNotificationsReadButton disabled={unreadCount === 0 || notificationsLoadFailed} />
      </div>

      {/* ── Filter tabs ────────────────────────────────────────────────────── */}
      <div role="tablist" aria-label="Notification filter" className="mt-6 flex gap-1 border-b border-outline-variant/30">
        <a
          href="/portal/notifications"
          role="tab"
          aria-selected={activeFilter === "all"}
          className={`flex h-11 items-center px-4 font-label text-label motion-safe:transition-colors motion-safe:duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${activeFilter === "all"
              ? "border-b-2 border-brand-navy text-brand-navy"
              : "text-text-grey hover:text-on-surface"
            }`}
        >
          All
        </a>
        <a
          href="/portal/notifications?filter=unread"
          role="tab"
          aria-selected={activeFilter === "unread"}
          className={`flex h-11 items-center gap-2 px-4 font-label text-label motion-safe:transition-colors motion-safe:duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${activeFilter === "unread"
              ? "border-b-2 border-brand-navy text-brand-navy"
              : "text-text-grey hover:text-on-surface"
            }`}
        >
          Unread
          {unreadCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-status-held px-1.5 font-label text-mono-sm font-bold text-surface-white">
              {unreadCount}
            </span>
          )}
        </a>
      </div>

      {/* ── Notification list ─────────────────────────────────────────────── */}
      <div className="mt-4">
        {notificationsLoadFailed ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-status-held/30 bg-status-held/5 px-6 py-12 text-center shadow-elevation-1">
            <AlertTriangle size={40} className="text-status-held" aria-hidden="true" />
            <p className="font-body text-body-md text-on-surface">Notifications are temporarily unavailable.</p>
            <p className="font-body text-body-sm text-text-grey">Refresh the page to try the authoritative notification query again.</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
            <Bell size={40} className="text-text-grey" aria-hidden="true" />
            <p className="font-body text-body-md text-text-grey">
              {activeFilter === "unread" ? "No unread notifications." : "No notifications yet."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const Icon = SEVERITY_ICON[row.severity];
              const classes = SEVERITY_CLASSES[row.severity];
              const isUnread = row.readAt === null;
              return (
                <li
                  key={row.id}
                  className={`flex gap-4 rounded-2xl border p-4 shadow-sm transition-all ${classes.border}`}
                >
                  <Icon size={22} className={`mt-0.5 shrink-0 ${classes.icon}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-mono-sm uppercase tracking-[0.05em] ${classes.badge}`}
                      >
                        {row.category}
                      </span>
                      {isUnread && (
                        <span
                          aria-label="Unread"
                          className="h-2 w-2 shrink-0 rounded-full bg-brand-red"
                        />
                      )}
                    </div>
                    <p className="mt-1.5 font-heading text-body-lg font-bold text-on-surface">
                      {row.title}
                    </p>
                    <p className="mt-0.5 font-body text-body-md text-text-grey">
                      {row.body}
                    </p>
                    <p className="mt-2 font-body text-body-sm text-text-grey">
                      {formatTimestamp(row.createdAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Denial states ──────────────────────────────────────────────────────────

function PermissionDenied() {
  return (
    <div className="mx-auto max-w-container px-8 py-12 text-center">
      <Bell size={40} className="mx-auto mb-3 text-text-grey" aria-hidden="true" />
      <p className="font-body text-body-md text-text-grey">
        You do not have permission to view notifications.
      </p>
      <p className="mt-2 font-body text-body-sm text-text-grey">
        This page requires the{" "}
        <span className="font-mono text-mono-md">notifications.read</span>{" "}
        capability.
      </p>
    </div>
  );
}

// Fail-safe empty state: no active party scope resolved for this session —
// never falls through to an unscoped query (see resolve-party-scope.ts).
function NoPartyScope() {
  return (
    <div className="mx-auto max-w-container px-8 py-12 text-center">
      <Bell size={40} className="mx-auto mb-3 text-text-grey" aria-hidden="true" />
      <p className="font-body text-body-md text-text-grey">
        No organization assignment is linked to your account.
      </p>
      <p className="mt-2 font-body text-body-sm text-text-grey">
        Contact your administrator to request portal access.
      </p>
    </div>
  );
}
