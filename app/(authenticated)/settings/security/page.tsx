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

export default function SettingsSecurityPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-heading text-headline-md font-extrabold text-on-surface">
        Security
      </h1>
      <p className="font-body text-body-md text-text-grey">
        Security event review and role/capability reference are not yet built in this pass.
        See `specs/02-rbac-roles/design.md` §8/§9 for the owning admin-UI design once this
        surface is scheduled.
      </p>
    </div>
  );
}
