// @vitest-environment jsdom
//
// RED-step test for `components/global/ShellStateView.tsx`, which does not
// exist yet. This is the UI-level proof of the state contract already
// established in `lib/shell/state.ts` (17 states, SHELL_STATE_KINDS).
//
// Traceability:
// - specs/05-ui-shell-and-navigation/design.md §3.4 ("Application state
//   catalog" — 17 rows, each with a distinct "Shell behavior" and message)
// - specs/05-ui-shell-and-navigation/requirements.md R6.6 ("The shell SHALL
//   distinguish initial session checking, route loading, retrying, timeout,
//   retry-exhausted, not-found, forbidden, and unexpected-error states;
//   each SHALL provide an appropriate safe recovery action or redirect")
//   and R6.7 (not-found must remain distinct from forbidden even when
//   public copy is similar).
//
// Assumed component contract (documented here since the component does not
// exist yet — the builder implements against this):
//   export function ShellStateView({ state }: { state: ShellState }): JSX
//   - Renders a single root element with `data-testid` =
//     `shell-state-${state.kind}` and an ARIA `role="status"` (or
//     equivalent live-region semantics per design.md §10).
//   - Renders visibly distinguishable text content per kind — not the same
//     generic "something went wrong" copy for every kind.

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SHELL_STATE_KINDS, type ShellState } from "@/lib/shell/state";
import { ShellStateView } from "@/components/global/ShellStateView";

// Minimal, valid payload per state.ts's discriminated union for every kind
// that carries extra fields; kinds with no extra fields need only `kind`.
function buildState(kind: ShellState["kind"]): ShellState {
  switch (kind) {
    case "deep_link_pending":
      return { kind, destination: "/receiving" };
    case "sign_out_transition":
      return { kind, status: "pending" };
    case "retrying":
      return { kind, attempt: 1, maxAttempts: 3 };
    case "timeout":
      return { kind, retryAvailable: true };
    case "error":
      return { kind, correlationId: "corr-123" };
    case "connectivity":
      return { kind, status: "offline" };
    case "synchronization":
      return { kind, status: "attention" };
    case "online_required":
      return { kind, action: "pick_list.generate" };
    default:
      return { kind } as ShellState;
  }
}

describe("ShellStateView (design.md §3.4, requirements.md R6.6/R6.7)", () => {
  it.each(SHELL_STATE_KINDS)(
    "renders a distinguishable, kind-tagged root for state kind %s",
    (kind) => {
      render(<ShellStateView state={buildState(kind)} />);
      const node = screen.getByTestId(`shell-state-${kind}`);
      expect(node).toBeInTheDocument();
    },
  );

  it("renders 17 states with 17 distinct pieces of text content (R6.6: each state has a distinct message)", () => {
    const seenText = new Set<string>();
    for (const kind of SHELL_STATE_KINDS) {
      const { unmount } = render(<ShellStateView state={buildState(kind)} />);
      const node = screen.getByTestId(`shell-state-${kind}`);
      const text = node.textContent?.trim() ?? "";
      expect(text.length).toBeGreaterThan(0);
      seenText.add(text);
      unmount();
    }
    expect(seenText.size).toBe(SHELL_STATE_KINDS.length);
  });

  it("renders visibly different content for not_found vs forbidden (R6.7: must remain distinct even when public copy is similar)", () => {
    const { unmount: unmountNotFound } = render(
      <ShellStateView state={{ kind: "not_found" }} />,
    );
    const notFoundText = screen
      .getByTestId("shell-state-not_found")
      .textContent?.trim();
    unmountNotFound();

    render(<ShellStateView state={{ kind: "forbidden" }} />);
    const forbiddenText = screen
      .getByTestId("shell-state-forbidden")
      .textContent?.trim();

    expect(notFoundText).not.toBe(forbiddenText);
  });
});

// ---------------------------------------------------------------------------
// R6.2 / R6.5 — mandatory 3-component error feedback structure
//
// Traceability:
// - specs/05-ui-shell-and-navigation/requirements.md R6.2: "Route and shell
//   errors SHALL provide a safe, recoverable user-facing state with an
//   explicit 3-component structure: What happened / Why it failed /
//   Next Action or Solution."
// - requirements.md R6.5: "Shell errors SHALL distinguish initial session
//   checking, route loading, retrying, timeout, retry-exhausted, not-found,
//   forbidden, and unexpected-error states" — i.e. session-checking/route
//   loading/retrying are progress states (kept as single-message), while
//   timeout/not-found/forbidden/unexpected-error are failures requiring the
//   3-part structure.
//
// Scope decision (test-writer, tasks.md §5 item): the following
// ShellState kinds represent an error/blocking condition and MUST render
// the full 3-part structure: error, not_found, forbidden, timeout
// (both retryAvailable: true and false), revoked_session, empty_access,
// online_required, storage_attention, and sign_out_transition when
// status === "failed". All other kinds (session_checking, loading,
// retrying, deep_link_pending, sign_out_transition when status !==
// "failed", connectivity, synchronization, stale, navigation_transition)
// remain single-message/status presentations and must NOT render the
// 3-part testids.
//
// Assumed contract (component does not implement this yet — RED step):
//   For an "error" kind, ShellStateView renders, within the existing
//   `data-testid="shell-state-${kind}"` root:
//     - data-testid="shell-state-what" — plain-language error title
//     - data-testid="shell-state-why" — brief context/reason
//     - data-testid="shell-state-next" — recovery action
//   Each has non-empty, mutually distinct text content. For "transient"
//   kinds, none of these three testids are rendered; only the existing
//   single-message `<p>` form is present.

const ERROR_KINDS_REQUIRING_THREE_PART: ShellState[] = [
  { kind: "error", correlationId: "corr-123" },
  { kind: "not_found" },
  { kind: "forbidden" },
  { kind: "timeout", retryAvailable: true },
  { kind: "timeout", retryAvailable: false },
  { kind: "revoked_session" },
  { kind: "empty_access" },
  { kind: "online_required", action: "pick_list.generate" },
  { kind: "storage_attention" },
  { kind: "sign_out_transition", status: "failed" },
];

const TRANSIENT_KINDS_WITHOUT_THREE_PART: ShellState[] = [
  { kind: "session_checking" },
  { kind: "loading" },
  { kind: "retrying", attempt: 1, maxAttempts: 3 },
  { kind: "deep_link_pending", destination: "/receiving" },
  { kind: "sign_out_transition", status: "pending" },
  { kind: "connectivity", status: "offline" },
  { kind: "synchronization", status: "attention" },
  { kind: "stale" },
  { kind: "navigation_transition" },
];

describe("ShellStateView 3-component error feedback structure (requirements.md R6.2, R6.5)", () => {
  it.each(ERROR_KINDS_REQUIRING_THREE_PART)(
    "renders distinct What/Why/Next parts for error kind $kind",
    (state) => {
      render(<ShellStateView state={state} />);
      const root = screen.getByTestId(`shell-state-${state.kind}`);

      const what = within(root).getByTestId("shell-state-what");
      const why = within(root).getByTestId("shell-state-why");
      const next = within(root).getByTestId("shell-state-next");

      const whatText = what.textContent?.trim() ?? "";
      const whyText = why.textContent?.trim() ?? "";
      const nextText = next.textContent?.trim() ?? "";

      expect(whatText.length).toBeGreaterThan(0);
      expect(whyText.length).toBeGreaterThan(0);
      expect(nextText.length).toBeGreaterThan(0);

      // The three parts must be genuinely distinct content, not the same
      // string repeated across all three testids.
      expect(new Set([whatText, whyText, nextText]).size).toBe(3);
    },
  );

  it("forbidden's Next Action mentions going back or contacting an administrator, not generic filler (R6.2)", () => {
    render(<ShellStateView state={{ kind: "forbidden" }} />);
    const root = screen.getByTestId("shell-state-forbidden");
    const nextText = within(root)
      .getByTestId("shell-state-next")
      .textContent?.toLowerCase()
      ?.trim();

    expect(nextText).toBeTruthy();
    expect(
      /back|administrator|contact|home|sign in/.test(nextText ?? ""),
    ).toBe(true);
  });

  it("not_found's Next Action offers a concrete way forward, not generic filler (R6.2)", () => {
    render(<ShellStateView state={{ kind: "not_found" }} />);
    const root = screen.getByTestId("shell-state-not_found");
    const nextText = within(root)
      .getByTestId("shell-state-next")
      .textContent?.toLowerCase()
      ?.trim();

    expect(nextText).toBeTruthy();
    expect(
      /back|home|dashboard|check the (url|link|address)/.test(nextText ?? ""),
    ).toBe(true);
  });

  it.each(TRANSIENT_KINDS_WITHOUT_THREE_PART)(
    "does NOT render the 3-part structure for transient/progress kind $kind, and keeps its single-message form",
    (state) => {
      render(<ShellStateView state={state} />);
      const root = screen.getByTestId(`shell-state-${state.kind}`);

      expect(within(root).queryByTestId("shell-state-what")).toBeNull();
      expect(within(root).queryByTestId("shell-state-why")).toBeNull();
      expect(within(root).queryByTestId("shell-state-next")).toBeNull();

      // Still renders its existing non-empty single-message content.
      expect((root.textContent ?? "").trim().length).toBeGreaterThan(0);
    },
  );
});
