// UI Preferences context — Dark Mode and table/page density.
//
// Traceability: specs/21-user-profile-and-settings/requirements.md FR-1.4
// ("Users SHALL be able to toggle global application preferences (e.g. Dark
// Mode, Compact Table View). These preferences SHALL persist across
// sessions") and design.md §1.1's Preferences tab
// (<DarkModeToggle>/<DensityToggle>) and tasks.md Task 21.4 ("Build a React
// Context provider ... to manage Dark Mode and table density states
// locally").
//
// KNOWN SEAM GAP (flag for integration-reviewer): neither `01-core-data-model`
// nor `02-rbac-roles`' `user_profiles` (design.md §4.1) defines a
// preferences/settings column or table, and design.md §5's settings-scope
// table lists "Email notification preferences"/"Language/locale"/"Timezone
// display" as user-editable without naming a backing table either. "Persist
// across sessions" is implemented here via `localStorage` (persists across
// sessions on the *same device/browser*, per the same-device durability a
// client-only store can actually offer) rather than a server round trip —
// cross-device persistence needs a real preferences table/column added to
// `01`/`02`'s schema before it can be wired server-side. Dark-mode's actual
// visual effect (a `dark:` Tailwind variant applied app-wide) is also not
// wired beyond toggling this state — brand-design-system.md defines no dark
// palette today, so no `dark:` styles exist yet to apply.

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Density = "standard" | "compact";

export interface UserPreferences {
  darkMode: boolean;
  density: Density;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  darkMode: false,
  density: "standard",
};

export const PREFERENCES_STORAGE_KEY = "wims:user-preferences";

// Pure, DOM-free — testable without jsdom/localStorage.
export function parsePreferences(raw: string | null): UserPreferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      darkMode: typeof parsed.darkMode === "boolean" ? parsed.darkMode : DEFAULT_PREFERENCES.darkMode,
      density: parsed.density === "compact" ? "compact" : "standard",
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function serializePreferences(preferences: UserPreferences): string {
  return JSON.stringify(preferences);
}

interface UserPreferencesContextValue {
  preferences: UserPreferences;
  setDarkMode: (darkMode: boolean) => void;
  setDensity: (density: Density) => void;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  // Hydrate from localStorage on mount only (client-only; avoids a
  // server/client render mismatch since the server has no localStorage).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setPreferences(parsePreferences(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, serializePreferences(preferences));
  }, [preferences]);

  const value = useMemo<UserPreferencesContextValue>(
    () => ({
      preferences,
      setDarkMode: (darkMode: boolean) =>
        setPreferences((prev) => ({ ...prev, darkMode })),
      setDensity: (density: Density) =>
        setPreferences((prev) => ({ ...prev, density })),
    }),
    [preferences],
  );

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UserPreferencesContextValue {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    // Defensive fallback (never expected once UserPreferencesProvider wraps
    // the Preferences tab) — mirrors the defensive-default pattern already
    // used by ShellChrome for a possibly-null shell authorization context.
    return {
      preferences: DEFAULT_PREFERENCES,
      setDarkMode: () => {},
      setDensity: () => {},
    };
  }
  return context;
}
