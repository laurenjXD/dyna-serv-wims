// Placeholder slot for 16-reporting-and-analytics's ActivityHeatmap.
//
// This file exists only so 05-ui-shell-and-navigation's LandingPage can
// import a stable "@/components/reporting/ActivityHeatmap" specifier — the
// same specifier components/global/__tests__/LandingPage.test.tsx mocks —
// without LandingPage.tsx needing to change once 16's real component is
// wired in. It intentionally does NOT reimplement any part of 16's
// ActivityHeatmap (out of scope for this pass); this is a stub only.
//
// KNOWN INTEGRATION GAP (flag for integration-reviewer, and re-check on the
// next merge from 16's implementation branch): 16-reporting-and-analytics's
// real ActivityHeatmap currently lives on a sibling work-track branch
// (components/analytics/ActivityHeatmap.tsx) that has not been merged into
// this branch. Once merged, replace this stub's body with an adapter that
// supplies that component's required props (data/flowFilter/onFilterChange/
// title) from real landing-page data — do not delete this file's import
// path, since LandingPage.tsx depends on it remaining stable.
//
// integration-reviewer note (2026-08-08): this is more than a body swap.
// lib/shell/landing.ts's LandingPageContent (office branch) only carries
// `activityHeatmap: boolean` today — a show/hide flag, no `data` or
// `flowFilter` state. Wiring the real component also needs
// LandingPageSummaryData/resolveLandingPageContent widened to carry the
// heatmap's actual data (or local filter-state management added directly in
// LandingPage.tsx) — plan for that alongside the prop-mapping work above,
// not as a separate surprise.
export function ActivityHeatmap() {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
      <p className="font-label text-label uppercase text-text-grey">Warehouse Activity</p>
      <p className="font-body text-body-sm text-text-grey">
        Activity heatmap coming soon.
      </p>
    </div>
  );
}
