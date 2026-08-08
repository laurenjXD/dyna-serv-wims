// `/settings/general` — system-wide configuration placeholder (FR-5).
//
// KNOWN SEAM GAP: FR-5.1 ("Enable Strict FIFO override approvals",
// "Default Currency") has no backing configuration table in `01`/`02`'s
// schema yet — this route exists to satisfy design.md §1.2's nav shape but
// does not implement FR-5's actual toggles, to avoid inventing an
// unpersisted config store. Flagging rather than faking.

export default function SettingsGeneralPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-heading text-headline-md font-semibold text-brand-navy">
        General
      </h1>
      <p className="font-body text-body-md text-text-grey">
        System-wide configuration (FR-5, e.g. FIFO override approval policy, default currency)
        has no backing table yet in `01-core-data-model`/`02-rbac-roles`. Not implemented in
        this pass — see this file&apos;s header comment.
      </p>
    </div>
  );
}
