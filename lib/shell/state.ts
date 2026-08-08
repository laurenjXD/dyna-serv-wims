"use client";

// Shell global state types and client-side sidebar state hook.
//
// Traceability:
// - specs/05-ui-shell-and-navigation/design.md §3.4 ("Application state
//   catalog" — 17 rows, each with a distinct trigger, shell behavior, and
//   key constraint).
// - design.md §6 ("At narrow mobile widths the sidebar collapses to a
//   hamburger/drawer").
// - requirements.md R6.6 (each state has a distinct message) and R6.7
//   (not_found vs forbidden must remain visibly distinct).
//
// `ShellState` is a discriminated union used by ShellStateView.tsx and
// AuthenticatedShellBoundary.tsx. `useShellSidebar` is a client-only hook
// that manages the mobile nav drawer open/close state.

import { useState } from "react";

// ---------------------------------------------------------------------------
// ShellState discriminated union (design.md §3.4, 17 states)
// ---------------------------------------------------------------------------

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

/**
 * All valid ShellState kind strings, in design.md §3.4 catalog order.
 * Used by ShellStateView.test.tsx's `it.each` to verify every state has a
 * distinct, non-empty message (R6.6).
 */
export const SHELL_STATE_KINDS = [
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
] as const satisfies ReadonlyArray<ShellState["kind"]>;

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
