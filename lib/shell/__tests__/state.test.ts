// RED-step unit tests for lib/shell/state.ts (does not exist yet).
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §3.4
// ("Application state catalog" -- the shell's complete global state
// inventory table: Session checking, Revoked session, Deep link, Sign-out
// transition, Loading, Retrying, Timeout/retry exhausted, Error, Not found,
// Forbidden, Empty, Stale, Connectivity, Synchronization, Storage attention,
// Online required, Navigation transition -- 17 distinct rows).
//
// Backing acceptance criteria: requirements.md R6.6 ("The shell SHALL
// distinguish initial session checking, route loading, retrying, timeout,
// retry-exhausted, not-found, forbidden, and unexpected-error states; each
// SHALL provide an appropriate safe recovery action or redirect") and the AC
// bullet "Initial session checking, retry/timeout, forbidden,
// storage-attention, online-required, synchronization-attention, and
// sign-out transition states are safe and recoverable." The core thing this
// spec calls out as a past risk (design.md's own state table exists because
// of it) is collapsing several of these into one generic "error" bucket --
// this file asserts each is a structurally distinct, identifiable value.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/shell/state.ts (for frontend-builder):
//
//   export type ShellStateKind =
//     | "session_checking"
//     | "revoked_session"
//     | "deep_link_pending"
//     | "sign_out_transition"
//     | "loading"
//     | "retrying"
//     | "timeout"
//     | "error"
//     | "not_found"
//     | "forbidden"
//     | "empty_access"
//     | "stale"
//     | "connectivity"
//     | "synchronization"
//     | "storage_attention"
//     | "online_required"
//     | "navigation_transition";
//
//   export const SHELL_STATE_KINDS: readonly ShellStateKind[]; // all 17,
//     // each appearing exactly once, in the order design.md §3.4 lists them.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

const EXPECTED_KINDS = [
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

describe("lib/shell/state — SHELL_STATE_KINDS is a complete, distinct catalog (design.md §3.4, R6.6)", () => {
  it("exports exactly the 17 distinct state kinds from design.md §3.4, in order", async () => {
    const { SHELL_STATE_KINDS } = await import("../state");
    expect(SHELL_STATE_KINDS).toEqual(EXPECTED_KINDS);
  });

  it("contains no duplicate kind values", async () => {
    const { SHELL_STATE_KINDS } = await import("../state");
    expect(new Set(SHELL_STATE_KINDS).size).toBe(SHELL_STATE_KINDS.length);
  });

  it("keeps 'timeout', 'error', 'not_found', and 'forbidden' as four DISTINCT values -- never collapsed into one generic 'error' bucket", async () => {
    const { SHELL_STATE_KINDS } = await import("../state");
    const distinctFailureStates = ["timeout", "error", "not_found", "forbidden"];
    for (const kind of distinctFailureStates) {
      expect(SHELL_STATE_KINDS).toContain(kind);
    }
    // Pairwise distinctness, spelled out explicitly per the past risk this
    // table exists to guard against.
    expect(new Set(distinctFailureStates).size).toBe(distinctFailureStates.length);
  });

  it("keeps 'connectivity' and 'synchronization' as two distinct states, never one merged indicator (design.md's explicit 'never display synced as a synonym for online or idle' rule)", async () => {
    const { SHELL_STATE_KINDS } = await import("../state");
    expect(SHELL_STATE_KINDS).toContain("connectivity");
    expect(SHELL_STATE_KINDS).toContain("synchronization");
  });

  it("keeps 'sign_out_transition' distinct from both 'loading' and 'revoked_session'", async () => {
    const { SHELL_STATE_KINDS } = await import("../state");
    const idx = new Set(SHELL_STATE_KINDS);
    expect(idx.has("sign_out_transition")).toBe(true);
    expect(idx.has("loading")).toBe(true);
    expect(idx.has("revoked_session")).toBe(true);
  });
});
