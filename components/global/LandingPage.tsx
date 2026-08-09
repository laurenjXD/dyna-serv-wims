// `/` landing page — renders the floor or office content shape resolved by
// lib/shell/landing.ts, never re-deriving that decision itself.
//
// Traceability: specs/05-ui-shell-and-navigation/requirements.md R11.2
// (floor vs. office summary shape per resolved surface), R11.5 (never
// KPI/financial-metric cards on `/`), R11.6 (office/"party" +
// reporting.read -> <ActivityHeatmap>, never for floor under any
// circumstance) and design.md §3.2's `/` route amendment prose.

import type { SessionPresentationTier } from "@/lib/shell/surface";
import {
  resolveLandingPageContent,
  type LandingPageSummaryData,
} from "@/lib/shell/landing";
import { ActivityHeatmap } from "@/components/reporting/ActivityHeatmap";

export function LandingPage({
  tier,
  hasReportingRead,
  data,
}: {
  tier: SessionPresentationTier;
  hasReportingRead: boolean;
  data: LandingPageSummaryData;
}) {
  const content = resolveLandingPageContent(tier, hasReportingRead, data);

  if (content.kind === "floor") {
    return (
      <div className="flex min-h-screen flex-col gap-6 p-floor-padding pb-24">
        <section
          data-testid="landing-task-counts"
          className="flex flex-col gap-2 rounded bg-surface-white p-4 shadow-elevation-2"
        >
          {/* Floor text has a hard 16px minimum (brand-design-system.md
              §2/§11) — the "TODAY" eyebrow and the three count labels below
              use font-label + text-body-md, not the type scale's 14px
              `label` row, matching the combination already established for
              FloorPrimaryAction/the work-queue CTA. */}
          <span className="font-label text-body-md uppercase tracking-wide text-on-surface">
            Today
          </span>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center">
              <span className="font-heading text-data-display font-semibold text-on-surface">
                {content.taskCounts.receiving}
              </span>
              <span className="font-label text-body-md uppercase text-on-surface">Receiving</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-heading text-data-display font-semibold text-on-surface">
                {content.taskCounts.picking}
              </span>
              <span className="font-label text-body-md uppercase text-on-surface">Picking</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-heading text-data-display font-semibold text-on-surface">
                {content.taskCounts.inspection}
              </span>
              <span className="font-label text-body-md uppercase text-on-surface">Inspection</span>
            </div>
          </div>
        </section>

        <section
          data-testid="landing-quick-actions"
          className="flex flex-col gap-2 rounded bg-surface-white p-4 shadow-elevation-2"
        >
          {/* "Quick Actions" is a section eyebrow (Epilogue/label role per
              brand-design-system.md §2), not a headline (Fira Sans) — fixed
              2026-08-08 per design-system-auditor finding. Still floor text,
              so text-body-md (16px) not text-label (14px). */}
          <h2 className="font-label text-body-md font-semibold uppercase tracking-wide text-brand-navy">
            Quick Actions
          </h2>
          <ul className="flex flex-col gap-2">
            {content.quickActions.map((action) => (
              <li key={action} className="font-body text-body-md text-on-surface">
                {action}
              </li>
            ))}
          </ul>
        </section>

        <a
          data-testid="landing-work-queue-cta"
          href={content.workQueueCta.href}
          className="fixed inset-x-0 bottom-0 z-30 flex min-h-16 w-full items-center justify-center bg-brand-red px-floor-padding font-label text-body-md text-surface-white active:scale-[0.97]"
        >
          {content.workQueueCta.label}
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-office-margin">
      <section
        data-testid="landing-queue-cards"
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        {content.queueCards.map((card) => (
          <div
            key={card.queue}
            className="rounded bg-surface-white p-4 shadow-elevation-1"
          >
            <p className="font-label text-label uppercase text-text-grey">{card.queue}</p>
            <p className="font-heading text-headline-md font-semibold text-on-surface">
              {card.openCount} open
            </p>
            <p className="font-body text-body-sm text-text-grey">{card.todayCount} today</p>
          </div>
        ))}
      </section>

      <section
        data-testid="landing-recent-activity"
        className="rounded bg-surface-white p-4 shadow-elevation-1"
      >
        <h2 className="font-heading text-headline-md font-semibold text-on-surface">
          Recent Activity
        </h2>
        <ul className="flex flex-col gap-2">
          {content.recentActivity.map((item) => (
            <li key={item.id} className="font-body text-body-md text-text-grey">
              {item.description}
            </li>
          ))}
        </ul>
      </section>

      {content.activityHeatmap && <ActivityHeatmap />}
    </div>
  );
}
