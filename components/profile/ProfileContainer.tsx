// <ProfileContainer> — floor-default stacked-sections personal-profile
// interface: Account / Security / Preferences as one continuous scrollable
// page, not tabs.
//
// Traceability: specs/21-user-profile-and-settings/design.md §1.1's
// component tree and tasks.md Task 21.1 ("Implement the centered
// <ProfileContainer>...").
//
// `/profile` is a "shared" surface (05-ui-shell-and-navigation design.md
// §3.3 — any authenticated user, including floor staff, reaches it, and
// "shared routes use floor-first layout and touch targets as the default...
// When in doubt, a shared route uses floor defaults"). `21`'s own design.md
// §1.1 never declares the `lg`-sidebar-enhancement exception §3.3 requires,
// so this module is now built to floor defaults throughout — solid
// surfaces (no glassmorphism, brand-design-system.md §6), 56px minimum
// touch targets (§3), `active:` press feedback instead of `hover:` (§9),
// `on-surface` body text (§1.2), and no text below 16px (§2).
//
// Tabs/side-by-side panels are explicitly named as an office-only pattern
// (brand-design-system.md §3: "Multi-step forms, tabs, and side-by-side
// panels are office patterns... If a flow genuinely needs multiple
// decisions, sequence them as separate full screens, not one dense
// screen"). Account/Security/Preferences read fine as one continuous page
// of clearly separated sections rather than three sequential screens, so
// that's the shape used here. (Amendment 2026-08-08 — see
// specs/21-user-profile-and-settings/design.md §1.1's updated note.)

import type { OwnProfile } from "@/app/(authenticated)/profile/actions";
import { AccountTab } from "./AccountTab";
import { SecurityTab } from "./SecurityTab";
import { PreferencesTab } from "./PreferencesTab";
import { UserPreferencesProvider } from "@/lib/user-settings/preferences";

export function ProfileContainer({ profile }: { profile: OwnProfile }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-floor-padding">
      <div>
        <h1 className="font-heading text-headline-md font-semibold text-on-surface">
          My Profile
        </h1>
        <p className="mt-1 font-body text-body-md text-on-surface">
          Manage your account, security, and application preferences.
        </p>
      </div>

      {/* Floor card: solid white, Level 2 elevation, per
          brand-design-system.md §6 — floor screens never get the
          translucent/backdrop-blur Level 1 office treatment. */}
      <section
        data-testid="profile-section-account"
        aria-labelledby="profile-section-account-heading"
        className="flex flex-col gap-4 rounded bg-white p-4 shadow-elevation-2"
      >
        <h2
          id="profile-section-account-heading"
          className="font-label text-body-md font-semibold uppercase tracking-wide text-primary"
        >
          Account
        </h2>
        <AccountTab profile={profile} />
      </section>

      <section
        data-testid="profile-section-security"
        aria-labelledby="profile-section-security-heading"
        className="flex flex-col gap-4 rounded bg-white p-4 shadow-elevation-2"
      >
        <h2
          id="profile-section-security-heading"
          className="font-label text-body-md font-semibold uppercase tracking-wide text-primary"
        >
          Security
        </h2>
        <SecurityTab profile={profile} />
      </section>

      <section
        data-testid="profile-section-preferences"
        aria-labelledby="profile-section-preferences-heading"
        className="flex flex-col gap-4 rounded bg-white p-4 shadow-elevation-2"
      >
        <h2
          id="profile-section-preferences-heading"
          className="font-label text-body-md font-semibold uppercase tracking-wide text-primary"
        >
          Preferences
        </h2>
        <UserPreferencesProvider>
          <PreferencesTab />
        </UserPreferencesProvider>
      </section>
    </div>
  );
}
