// The floor primary-action control — one obvious next action per floor
// screen (Confirm, Pass/Fail, Scan Next).
//
// Traceability: specs/00-steering/brand-design-system.md §3 (floor primary
// actions: 64px minimum height, full-width, bottom-third thumb zone) and §9
// ("Floor buttons get an immediate `active:` press state (scale to 0.97, no
// transition delay) instead of any `hover:` effect"). requirements.md R7.7
// (immediate press feedback, never hover-dependent) and R7.8 (reduced
// motion respected).

"use client";

export interface FloorPrimaryActionProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function FloorPrimaryAction({ label, onPress, disabled }: FloorPrimaryActionProps) {
  return (
    <button
      type="button"
      data-testid="floor-primary-action"
      // Brand doc §3's floor primary-action minimum (64px), expressed as a
      // data attribute so callers/tests never couple to Tailwind class
      // spelling. `min-h-16` (Tailwind's default 4rem step) is the same
      // 64px value, sourced from the 8px base unit (§4), never an arbitrary
      // pixel literal.
      data-min-height-px="64"
      onClick={onPress}
      disabled={disabled}
      aria-disabled={disabled}
      className="flex min-h-16 w-full items-center justify-center gap-2 rounded bg-primary px-4 font-label text-body-md text-surface-white transition-transform duration-0 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:bg-status-neutral disabled:opacity-70"
    >
      {label}
    </button>
  );
}
