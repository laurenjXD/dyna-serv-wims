// Preferences tab — <DarkModeToggle>, <DensityToggle>.
//
// Traceability: specs/21-user-profile-and-settings/design.md §1.1 and
// tasks.md Task 21.4. Must be rendered inside a <UserPreferencesProvider>
// (see ProfileContainer.tsx) — see lib/user-settings/preferences.tsx's
// header comment for the localStorage-only persistence seam gap.

"use client";

import { useUserPreferences } from "@/lib/user-settings/preferences";
import { Moon, LayoutGrid } from "lucide-react";

function ToggleRow({
  icon: Icon,
  iconBg,
  label,
  description,
  checked,
  onChange,
  testId,
}: {
  icon: typeof Moon;
  iconBg: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-[#F8FAFC] transition-colors hover:bg-slate-50">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 mt-0.5 ${iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <span className="font-heading text-xs font-bold text-slate-900 block">{label}</span>
          <p className="font-body text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      
      {/* Modern, elegant toggle switch */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 ${
          checked ? "bg-brand-navy" : "bg-slate-200"
        }`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export function PreferencesTab() {
  const { preferences, setDarkMode, setDensity } = useUserPreferences();

  return (
    <div className="space-y-3">
      <ToggleRow
        icon={Moon}
        iconBg="bg-purple-50 text-purple-700 border border-purple-100"
        label="Dark Mode"
        description="Use a darker, high-contrast color palette across the application."
        checked={preferences.darkMode}
        onChange={setDarkMode}
        testId="dark-mode-toggle"
      />
      <ToggleRow
        icon={LayoutGrid}
        iconBg="bg-blue-50 text-blue-700 border border-blue-100"
        label="Compact Table Density"
        description="Reduce row padding in master inventory, orders, and receiving data tables."
        checked={preferences.density === "compact"}
        onChange={(checked) => setDensity(checked ? "compact" : "standard")}
        testId="density-toggle"
      />
    </div>
  );
}
