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

import {
  AlertTriangle,
  Clock,
  LogOut,
  SaveOff,
  SearchX,
  ShieldAlert,
  ShieldOff,
  WifiOff,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ShellState } from "@/lib/shell/state";

function messageFor(state: ShellState): string {
  switch (state.kind) {
    case "session_checking":
      return "Checking your session…";
    case "revoked_session":
      return "Your session has ended. Sign in again to continue.";
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

// R6.2 — the mandatory 3-component structure (What happened / Why it
// failed / Next Action or Solution) for error/blocking states only. Returns
// null for transient/progress states, which keep the single-message form.
interface ThreePartMessage {
  what: string;
  why: string;
  next: string;
  // R7.7 — status/error states must not rely on color alone; each failure
  // kind carries its own semantically distinct icon alongside the copy.
  Icon: LucideIcon;
}

function threePartFor(state: ShellState): ThreePartMessage | null {
  switch (state.kind) {
    case "error":
      return {
        what: "Something went wrong on this page.",
        why: state.correlationId
          ? `An unexpected error occurred. Reference: ${state.correlationId}`
          : "An unexpected error occurred and no reference ID is available.",
        next: "Try again, return home, or sign out and back in.",
        Icon: AlertTriangle,
      };
    case "not_found":
      return {
        what: "We couldn't find that page or resource.",
        why: "The link may be outdated, mistyped, or the item may have been moved or removed.",
        next: "Go back, return to the dashboard, or check the URL for typos.",
        Icon: SearchX,
      };
    case "forbidden":
      return {
        what: "You don't have access to this page or resource.",
        why: "Your account role doesn't have permission to view this.",
        next: "Go back to a page you have access to, or contact your administrator to request access.",
        Icon: ShieldAlert,
      };
    case "timeout":
      return {
        what: "This request timed out.",
        why: "It took too long to get a response from the server.",
        next: state.retryAvailable
          ? "Retry the request, or go back if it keeps failing."
          : "Wait a moment before trying again; retrying immediately isn't available right now.",
        Icon: Clock,
      };
    case "revoked_session":
      return {
        what: "Your session has ended.",
        why: "You were signed out, either by yourself elsewhere or by an administrator.",
        next: "Sign in again to continue.",
        Icon: LogOut,
      };
    case "empty_access":
      return {
        what: "Your account doesn't have any access configured yet.",
        why: "No role or permissions have been assigned to this account.",
        next: "Contact your administrator to have access configured for your account.",
        Icon: ShieldOff,
      };
    case "online_required":
      return {
        what: "An internet connection is required.",
        why: `"${state.action}" can't be completed while offline.`,
        next: "Reconnect to the internet, then try again.",
        Icon: WifiOff,
      };
    case "storage_attention":
      return {
        what: "Local storage is unavailable.",
        why: "The device couldn't access on-device storage, so offline features are disabled.",
        next: "Check your device's storage settings, then reload this page.",
        Icon: SaveOff,
      };
    case "sign_out_transition":
      return state.status === "failed"
        ? {
            what: "We couldn't sign you out.",
            why: "The sign-out request didn't complete successfully.",
            next: "Please try signing out again.",
            Icon: XCircle,
          }
        : null;
    default:
      return null;
  }
}

export function ShellStateView({ state }: { state: ShellState }) {
  const threePart = threePartFor(state);

  return (
    <div
      data-testid={`shell-state-${state.kind}`}
      role={roleFor(state)}
      aria-live={roleFor(state) === "alert" ? "assertive" : "polite"}
      className="flex min-h-[160px] w-full flex-col items-center justify-center gap-2 p-floor-padding text-center font-body text-body-md text-on-surface"
    >
      {threePart ? (
        <>
          <threePart.Icon aria-hidden="true" className="h-8 w-8" />
          <p data-testid="shell-state-what" className="font-heading font-semibold">
            {threePart.what}
          </p>
          <p data-testid="shell-state-why">{threePart.why}</p>
          <p data-testid="shell-state-next">{threePart.next}</p>
        </>
      ) : (
        <p>{messageFor(state)}</p>
      )}
    </div>
  );
}
