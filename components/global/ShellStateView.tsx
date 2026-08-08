// Shell global-state renderer.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §3.4
// ("Application state catalog" — 17 rows, each with a distinct shell
// behavior/message) and requirements.md R6.6 (distinct message per state)
// and R6.7 (not-found must remain visibly distinct from forbidden even
// though both use safe, non-disclosing copy).
//
// This component owns presentation only. It never decides which state to
// show (that is RouteGuard/AuthenticatedShellBoundary/feature code calling
// in with a ShellState value) and never re-derives forbidden-vs-not-found.

import type { ShellState } from "@/lib/shell/state";

function messageFor(state: ShellState): string {
  switch (state.kind) {
    case "session_checking":
      return "Checking your session…";
    case "revoked_session":
      return "Your session has ended. Redirecting you to sign in…";
    case "deep_link_pending":
      return `Preparing your destination (${state.destination})…`;
    case "sign_out_transition":
      return state.status === "failed"
        ? "We couldn't sign you out. Please try again."
        : "Signing you out…";
    case "loading":
      return "Loading…";
    case "retrying":
      return `Retrying (attempt ${state.attempt} of ${state.maxAttempts})…`;
    case "timeout":
      return state.retryAvailable
        ? "This is taking longer than expected. You can retry or go back."
        : "This request timed out and cannot be retried right now.";
    case "error":
      return state.correlationId
        ? `Something went wrong. Try again, return home, or sign out. Reference: ${state.correlationId}`
        : "Something went wrong. Try again, return home, or sign out.";
    case "not_found":
      return "We couldn't find that page or resource.";
    case "forbidden":
      return "You don't have access to this page or resource.";
    case "empty_access":
      return "Your account doesn't have any access configured yet. Contact your administrator for access.";
    case "stale":
      return "Your navigation may be out of date. Reload to refresh your access.";
    case "connectivity":
      if (state.status === "online") return "You're back online.";
      if (state.status === "offline") return "You're offline. Some actions are unavailable.";
      return "Checking your connection…";
    case "synchronization":
      if (state.status === "syncing") return "Syncing queued work…";
      if (state.status === "attention") return "Some queued work needs your attention.";
      return "Sync is idle.";
    case "storage_attention":
      return "Local storage is unavailable. Some offline features are disabled.";
    case "online_required":
      return `An internet connection is required to complete "${state.action}".`;
    case "navigation_transition":
      return "Loading the next page…";
    default:
      return "Loading…";
  }
}

function roleFor(state: ShellState): "status" | "alert" {
  return state.kind === "revoked_session" || state.kind === "error" ? "alert" : "status";
}

export function ShellStateView({ state }: { state: ShellState }) {
  return (
    <div
      data-testid={`shell-state-${state.kind}`}
      role={roleFor(state)}
      aria-live={roleFor(state) === "alert" ? "assertive" : "polite"}
      className="flex min-h-[160px] w-full flex-col items-center justify-center gap-2 p-floor-padding text-center font-body text-body-md text-on-surface"
    >
      <p>{messageFor(state)}</p>
    </div>
  );
}
