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

  // "office" and "party" share the identical office content shape
  // (R11.2), including the reporting.read-gated heatmap widget.
  return {
    kind: "office",
    queueCards: data.queueCards,
    recentActivity: data.recentActivity,
    activityHeatmap: hasReportingRead,
  };
}
