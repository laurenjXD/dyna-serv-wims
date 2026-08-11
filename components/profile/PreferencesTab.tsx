// Preferences tab — <DarkModeToggle>, <DensityToggle>.
//
// Traceability: specs/21-user-profile-and-settings/design.md §1.1 and
// tasks.md Task 21.4. Must be rendered inside a <UserPreferencesProvider>
// (see ProfileContainer.tsx) — see lib/user-settings/preferences.tsx's
// header comment for the localStorage-only persistence seam gap.

"use client";

import { useUserPreferences } from "@/lib/user-settings/preferences";

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  testId,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded border border-outline-variant/30 px-4 py-3">
      <div>
        <p className="font-body text-body-md text-on-surface">{label}</p>
        <p className="font-body text-body-md text-on-surface">{description}</p>
      </div>
      {/* Floor default touch target: 56px minimum (brand-design-system.md
          §3) — the track itself grows to h-14 w-24 (56x96px) rather than
          adding invisible hit-area padding around a visually tiny switch,
          so the enlarged target is honest about what's tappable.
          `active:scale-[0.97]` press feedback, no `hover:`, per §9. */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={`flex h-14 w-24 shrink-0 items-center rounded-full px-1.5 transition-colors active:scale-[0.97] motion-reduce:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          checked ? "bg-action-blue justify-end" : "bg-outline-variant/60 justify-start"
        }`}
      >
        <span className="h-11 w-11 rounded-full bg-white shadow-elevation-1" />
      </button>
    </div>
  );
}

export function PreferencesTab() {
  const { preferences, setDarkMode, setDensity } = useUserPreferences();

  return (
    <div className="flex flex-col gap-3">
      <ToggleRow
        label="Dark mode"
        description="Use a darker color palette across the app."
        checked={preferences.darkMode}
        onChange={setDarkMode}
        testId="dark-mode-toggle"
      />
      <ToggleRow
        label="Compact table view"
        description="Reduce row padding in data tables and lists."
        checked={preferences.density === "compact"}
        onChange={(checked) => setDensity(checked ? "compact" : "standard")}
        testId="density-toggle"
      />
    </div>
  );
}
