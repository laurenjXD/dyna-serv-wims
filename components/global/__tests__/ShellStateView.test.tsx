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
import { render, screen } from "@testing-library/react";
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
