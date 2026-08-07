// @vitest-environment jsdom
//
// RED-step test for `components/global/FloorPrimaryAction.tsx`, which does
// not exist yet. Proves the floor primary-action control never depends on
// a `:hover` state for usability or visibility, per the brand system's
// touch/press-vs-hover rule.
//
// Traceability:
// - specs/00-steering/brand-design-system.md §9 ("Touch/press feedback
//   (floor) vs. hover (office) — these are not interchangeable... Floor
//   buttons get an immediate `active:` press state (scale to 0.97, no
//   transition delay) instead of any `hover:` effect") and §3's floor
//   primary-action touch-target rule (64px minimum height, full-width).
// - specs/05-ui-shell-and-navigation/requirements.md R7.7 ("Floor controls
//   SHALL use immediate press feedback rather than hover-dependent
//   behavior") and R7.8 (reduced-motion respected; no essential shell
//   state may depend on animation).
//
// This is a structural assertion on classNames/attributes (per this
// session's explicit instruction), not a real CSS engine test — jsdom does
// not apply Tailwind's generated stylesheet, so no `:hover`/`:active`
// pseudo-class can actually be evaluated here.
//
// Assumed component contract (RED-step decision):
//   export function FloorPrimaryAction(props: {
//     label: string;
//     onPress: () => void;
// }): JSX.Element
//   - Renders a single <button> (or <a> for navigation CTAs) with
//     `data-testid="floor-primary-action"`.
//   - `data-min-height-px="64"` — the brand-design-system §3 floor
//     primary-action minimum, expressed as a data attribute so this test
//     does not couple to an arbitrary Tailwind class-name spelling.
//   - className contains no substring "hover:" anywhere — floor controls
//     use `active:` press feedback only, never `hover:` (brand doc §9,
//     R7.7).
//   - className contains "active:" (the press-feedback marker).

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
// @ts-expect-error - component does not exist yet; this is the RED step.
import { FloorPrimaryAction } from "@/components/global/FloorPrimaryAction";

describe("FloorPrimaryAction (brand-design-system.md §9, requirements.md R7.7)", () => {
  it("renders a control with the brand-documented 64px floor primary-action minimum", () => {
    render(<FloorPrimaryAction label="Confirm" onPress={() => {}} />);
    const control = screen.getByTestId("floor-primary-action");
    expect(control).toHaveAttribute("data-min-height-px", "64");
  });

  it("never applies a hover-dependent class (brand doc §9: active: press feedback, never hover: on floor)", () => {
    render(<FloorPrimaryAction label="Confirm" onPress={() => {}} />);
    const control = screen.getByTestId("floor-primary-action");
    const className = control.className ?? "";
    expect(className).not.toMatch(/hover:/);
  });

  it("applies an active: press-feedback class instead (immediate press feedback, R7.7)", () => {
    render(<FloorPrimaryAction label="Confirm" onPress={() => {}} />);
    const control = screen.getByTestId("floor-primary-action");
    const className = control.className ?? "";
    expect(className).toMatch(/active:/);
  });

  it("is reachable and activatable without a pointer-hover gesture (design.md §8.1: floor primary action is explicit and reachable, never hover-only)", () => {
    const onPress = vi.fn();
    render(<FloorPrimaryAction label="Confirm" onPress={onPress} />);
    const control = screen.getByTestId("floor-primary-action");
    // A plain click (no prior hover/mouseover event dispatched) must work.
    control.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onPress).toHaveBeenCalledOnce();
  });
});
