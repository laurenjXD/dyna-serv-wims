// Shell global state contract — a discriminated union, never a collapsed
// generic-error type. Also exports `useShellSidebar`, the client-only hook
// backing ShellChrome's mobile nav drawer toggle.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §3.4
// ("Application state catalog", 17 distinct rows), requirements.md R6.6,
// and design.md §6 ("At narrow mobile widths the sidebar collapses to a
// hamburger/drawer").

"use client";

import { useState } from "react";

export type ShellStateKind =
  | "session_checking"
  | "revoked_session"
  | "deep_link_pending"
  | "sign_out_transition"
  | "loading"
  | "retrying"
  | "timeout"
  | "error"
  | "not_found"
  | "forbidden"
  | "empty_access"
  | "stale"
  | "connectivity"
  | "synchronization"
  | "storage_attention"
  | "online_required"
  | "navigation_transition";

export const SHELL_STATE_KINDS: readonly ShellStateKind[] = [
  "session_checking",
  "revoked_session",
  "deep_link_pending",
  "sign_out_transition",
  "loading",
  "retrying",
  "timeout",
  "error",
  "not_found",
  "forbidden",
  "empty_access",
  "stale",
  "connectivity",
  "synchronization",
  "storage_attention",
  "online_required",
  "navigation_transition",
];

// A discriminated union modelling each state's distinct payload shape, per
// design.md §3.4's per-row "Trigger / condition" and "Shell behavior"
// columns. Not directly exercised by the current unit tests (which assert
// the SHELL_STATE_KINDS catalog), but provided so downstream shell
// components have a single non-collapsed contract to consume rather than
// re-deriving one per feature.
export type ShellState =
  | { kind: "session_checking" }
  | { kind: "revoked_session" }
  | { kind: "deep_link_pending"; destination: string }
  | { kind: "sign_out_transition"; status: "pending" | "failed" }
  | { kind: "loading" }
  | { kind: "retrying"; attempt: number; maxAttempts: number }
  | { kind: "timeout"; retryAvailable: boolean }
  | { kind: "error"; correlationId?: string }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "empty_access" }
  | { kind: "stale" }
  | { kind: "connectivity"; status: "online" | "offline" | "checking" }
  | { kind: "synchronization"; status: "idle" | "syncing" | "attention" }
  | { kind: "storage_attention" }
  | { kind: "online_required"; action: string }
  | { kind: "navigation_transition" };



// ---------------------------------------------------------------------------
// Sidebar open/close hook (client-only)
// ---------------------------------------------------------------------------

export interface ShellSidebarState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/**
 * Manages the mobile navigation drawer open/close state for ShellChrome.
 * Must only be used inside a "use client" component. Intentionally simple:
 * useState only, no Zustand, no Context, no external state library.
 */
export function useShellSidebar(): ShellSidebarState {
  const [isOpen, setIsOpen] = useState(false);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  };
}
