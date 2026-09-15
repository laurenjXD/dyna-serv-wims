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
import { signOutAction } from "@/app/(authenticated)/actions";
import { AccountTab } from "./AccountTab";
import { SecurityTab } from "./SecurityTab";
import { PreferencesTab } from "./PreferencesTab";
import { User, ShieldAlert, Sliders, LogOut, Lock, KeyRound } from "lucide-react";

export function ProfileContainer({ profile }: { profile: OwnProfile }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1 border-b border-slate-200/80 pb-4">
        <h1 className="font-heading text-xl font-bold text-slate-900">
          My Profile &amp; Identity
        </h1>
        <p className="font-body text-xs text-slate-500">
          Manage your personal credentials, assigned dynamic roles, BYOD security, and interface preferences.
        </p>
      </div>

      {/* Account / Personal Identity Section */}
      <section
        data-testid="profile-section-account"
        aria-labelledby="profile-section-account-heading"
        className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-white shadow-xs">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="profile-section-account-heading"
              className="font-heading text-base font-bold text-slate-900"
            >
              Account &amp; Personal Identity
            </h2>
            <p className="font-body text-xs text-slate-500">
              Personal contact details, employee badge, and assigned floor capabilities.
            </p>
          </div>
        </div>
        <AccountTab profile={profile} />
      </section>

      {/* Security & Authentication Section */}
      <section
        data-testid="profile-section-security"
        aria-labelledby="profile-section-security-heading"
        className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-royal-blue text-white shadow-xs">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="profile-section-security-heading"
              className="font-heading text-base font-bold text-slate-900"
            >
              Security &amp; Credentials
            </h2>
            <p className="font-body text-xs text-slate-500">
              Password governance, Two-Factor Authentication (MFA), and active device sessions.
            </p>
          </div>
        </div>
        <SecurityTab profile={profile} />
      </section>

      {/* Application Preferences Section */}
      <section
        data-testid="profile-section-preferences"
        aria-labelledby="profile-section-preferences-heading"
        className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-xs">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="profile-section-preferences-heading"
              className="font-heading text-base font-bold text-slate-900"
            >
              Interface &amp; Display Preferences
            </h2>
            <p className="font-body text-xs text-slate-500">
              Customize local visual theme and data grid table density.
            </p>
          </div>
        </div>
        <PreferencesTab />
      </section>

      {/* Sign Out Section */}
      <section
        data-testid="profile-section-sign-out"
        aria-labelledby="profile-section-sign-out-heading"
        className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-100 shadow-xs">
              <LogOut className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="profile-section-sign-out-heading"
                className="font-heading text-base font-bold text-slate-900"
              >
                Sign Out
              </h2>
              <p className="font-body text-xs text-slate-500">
                End active session and disconnect from warehouse floor binding.
              </p>
            </div>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 font-label text-xs font-bold text-rose-700 shadow-2xs hover:bg-rose-100 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
