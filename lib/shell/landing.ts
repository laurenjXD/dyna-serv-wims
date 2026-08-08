<<<<<<< HEAD
// `/` landing page floor-vs-office content-shape resolution.
//
// Traceability: specs/05-ui-shell-and-navigation/requirements.md R11 and
// design.md §3.2's `/` route amendment prose. This is a pure content-shape
// decision only — the actual React render is a separate, later step.

import type { SessionPresentationTier } from "./surface";

export interface LandingPageSummaryData {
  taskCounts: { receiving: number; picking: number; inspection: number };
  quickActions: readonly string[];
  workQueueCta: { label: string; href: string };
  queueCards: readonly {
    queue: "receiving" | "picking" | "inspection";
    openCount: number;
    todayCount: number;
  }[];
  recentActivity: readonly { id: string; description: string }[];
}

export type LandingPageContent =
  | {
      kind: "floor";
      taskCounts: LandingPageSummaryData["taskCounts"];
      quickActions: LandingPageSummaryData["quickActions"];
      workQueueCta: LandingPageSummaryData["workQueueCta"];
    }
  | {
      kind: "office";
      queueCards: LandingPageSummaryData["queueCards"];
      recentActivity: LandingPageSummaryData["recentActivity"];
      activityHeatmap: boolean;
    };

=======
// Landing page content resolution — maps the resolved session tier to the
// correct floor or office content shape.
//
// Traceability:
// - specs/05-ui-shell-and-navigation/requirements.md R11.2 (floor vs. office
//   summary per resolved surface), R11.5 (never KPI cards or financial
//   metrics on `/`), R11.6 (office/"party" + reporting.read ->
//   activityHeatmap flag; never for floor under any circumstance).
// - design.md §3.2's `/` route amendment prose (floor: task-count summary,
//   Quick Actions, one full-width work-queue CTA; office: per-queue summary
//   cards, Recent Activity feed, optional <ActivityHeatmap> widget).
//
// This module is pure data transformation — no React, no I/O, no side
// effects. The caller (app/(authenticated)/page.tsx) supplies the resolved
// tier, capability flag, and actual data from its own server queries.

import type { SessionPresentationTier } from "./surface";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface TaskCounts {
  receiving: number;
  picking: number;
  inspection: number;
}

export interface WorkQueueCta {
  label: string;
  href: string;
}

export interface QueueCard {
  queue: string;
  openCount: number;
  todayCount: number;
}

export interface RecentActivityItem {
  id: string;
  description: string;
}

/**
 * All summary figures the landing page may need. The caller sources each
 * field from the appropriate feature backend (07/08/11/09/16); this type
 * owns no data itself.
 */
export interface LandingPageSummaryData {
  // Floor fields
  taskCounts: TaskCounts;
  quickActions: string[];
  workQueueCta: WorkQueueCta;
  // Office fields
  queueCards: QueueCard[];
  recentActivity: RecentActivityItem[];
}

// ---------------------------------------------------------------------------
// Output types (discriminated union — floor or office shape)
// ---------------------------------------------------------------------------

export interface FloorLandingContent {
  kind: "floor";
  taskCounts: TaskCounts;
  quickActions: string[];
  workQueueCta: WorkQueueCta;
}

export interface OfficeLandingContent {
  kind: "office";
  queueCards: QueueCard[];
  recentActivity: RecentActivityItem[];
  /**
   * True only when the session holds `reporting.read` AND the tier is not
   * "floor". The caller renders the <ActivityHeatmap> component iff this is
   * true; the shell never renders it for floor sessions regardless of grants
   * (R11.6 — floor staff never hold reporting.read per 16 §2.4, but this
   * guard is belt-and-suspenders).
   */
  activityHeatmap: boolean;
}

export type LandingPageContent = FloorLandingContent | OfficeLandingContent;

// ---------------------------------------------------------------------------
// Resolution logic
// ---------------------------------------------------------------------------

/**
 * Returns the content shape appropriate for the current session tier.
 *
 * - "floor" tier → FloorLandingContent (task counts, quick actions, CTA).
 * - "office" or "party" tier → OfficeLandingContent (queue cards, activity
 *   feed, optional heatmap). "party" deliberately reuses the office shape
 *   per design.md §3.3: party sessions use the office shell composition.
 *
 * Never includes KPI cards or financial metrics (R11.5).
 */
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
export function resolveLandingPageContent(
  tier: SessionPresentationTier,
  hasReportingRead: boolean,
  data: LandingPageSummaryData,
): LandingPageContent {
  if (tier === "floor") {
    return {
      kind: "floor",
      taskCounts: data.taskCounts,
      quickActions: data.quickActions,
      workQueueCta: data.workQueueCta,
    };
  }

<<<<<<< HEAD
  // "office" and "party" share the identical office content shape
  // (R11.2), including the reporting.read-gated heatmap widget.
=======
  // "office" and "party" both use the office shape.
  // activityHeatmap is gated by reporting.read at the widget level, and
  // never shown for floor sessions regardless of grants (R11.6).
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
  return {
    kind: "office",
    queueCards: data.queueCards,
    recentActivity: data.recentActivity,
    activityHeatmap: hasReportingRead,
  };
}
