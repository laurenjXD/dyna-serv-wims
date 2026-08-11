// `/settings/security` — admin-facing security configuration placeholder.
//
// Scope note: this task's explicit build scope is the `/settings/team`
// grid + invite flow (see the parent prompt). This route exists to satisfy
// the secondary left-rail navigation shape design.md §1.2 specifies
// ("Team Members / Security / General") and RBAC gating (../layout.tsx),
// but its content — role/capability reference (02 design.md §9's "Role
// reference" row), rbac_security_events review UI, MFA-required policy
// toggle — is deliberately out of scope for this pass. Flagging as a
// placeholder rather than silently shipping an empty nav destination with
// no explanation.

import { ShieldCheck } from "lucide-react";

export default function SettingsSecurityPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-headline-md font-extrabold text-on-surface">
          Security
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          Password and session policy configuration. Note: these are currently placeholders.
        </p>
      </div>

      <div className="rounded-2xl border border-outline-variant/30 bg-white shadow-elevation-1">
        <form className="flex flex-col gap-6 p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2 md:col-span-2">
              <h2 className="font-heading text-headline-sm font-semibold text-on-surface">
                Authentication Policy
              </h2>
            </div>
            
            <div className="flex items-start gap-3 md:col-span-2">
              <input
                type="checkbox"
                id="requireMfa"
                className="mt-1 h-5 w-5 rounded border-outline-variant/30 text-primary focus:ring-primary"
              />
              <label htmlFor="requireMfa" className="flex flex-col gap-1">
                <span className="font-label text-label text-on-surface">
                  Enforce Multi-Factor Authentication (MFA)
                </span>
                <span className="font-body text-body-sm text-on-surface-variant">
                  Require all users to configure a second factor before accessing the system.
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-label text-label text-on-surface-variant">
                Password Expiration
              </label>
              <select className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <option value="never">Never expire</option>
                <option value="90">Every 90 days</option>
                <option value="180">Every 180 days</option>
              </select>
            </div>

            <div className="mt-4 flex flex-col gap-2 md:col-span-2">
              <h2 className="font-heading text-headline-sm font-semibold text-on-surface">
                Session Policy
              </h2>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-label text-label text-on-surface-variant">
                Idle Timeout
              </label>
              <select className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="240">4 hours</option>
              </select>
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="font-label text-label text-on-surface-variant">
                Absolute Session Timeout
              </label>
              <select className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <option value="8">8 hours (Typical Shift)</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-3 border-t border-outline-variant/30 pt-6">
            <button
              type="submit"
              className="flex h-11 items-center justify-center gap-2 rounded bg-primary px-6 font-label text-label tracking-wide text-white transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <ShieldCheck size={18} aria-hidden="true" />
              Save Security Policy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
