// `/settings/general` — system-wide configuration placeholder (FR-5).
//
// KNOWN SEAM GAP: FR-5.1 ("Enable Strict FIFO override approvals",
// "Default Currency") has no backing configuration table in `01`/`02`'s
// schema yet — this route exists to satisfy design.md §1.2's nav shape but
// does not implement FR-5's actual toggles, to avoid inventing an
// unpersisted config store. Flagging rather than faking.

import { Save } from "lucide-react";

export default function SettingsGeneralPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-headline-md font-extrabold text-on-surface">
          General
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          System-wide organization configuration (FR-5). Note: these are currently placeholders.
        </p>
      </div>

      <div className="rounded-2xl border border-outline-variant/30 bg-white shadow-elevation-1">
        <form className="flex flex-col gap-6 p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2 md:col-span-2">
              <h2 className="font-heading text-headline-sm font-semibold text-on-surface">
                Localization &amp; Defaults
              </h2>
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="font-label text-label text-on-surface-variant">
                Default Currency
              </label>
              <select className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <option value="PHP">PHP (₱)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-label text-label text-on-surface-variant">
                Timezone
              </label>
              <select className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <option value="Asia/Manila">Asia/Manila (PHT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div className="mt-4 flex flex-col gap-2 md:col-span-2">
              <h2 className="font-heading text-headline-sm font-semibold text-on-surface">
                Operational Policies
              </h2>
            </div>

            <div className="flex items-start gap-3 md:col-span-2">
              <input
                type="checkbox"
                id="strictFifo"
                className="mt-1 h-5 w-5 rounded border-outline-variant/30 text-primary focus:ring-primary"
                defaultChecked
              />
              <label htmlFor="strictFifo" className="flex flex-col gap-1">
                <span className="font-label text-label text-on-surface">
                  Strict FIFO/FEFO Allocation
                </span>
                <span className="font-body text-body-sm text-on-surface-variant">
                  Require Supervisor approval for any inventory allocation that violates strict FEFO (perishable) or FIFO (non-perishable) rules.
                </span>
              </label>
            </div>
            
            <div className="flex items-start gap-3 md:col-span-2">
              <input
                type="checkbox"
                id="autoConfirm"
                className="mt-1 h-5 w-5 rounded border-outline-variant/30 text-primary focus:ring-primary"
              />
              <label htmlFor="autoConfirm" className="flex flex-col gap-1">
                <span className="font-label text-label text-on-surface">
                  Auto-Confirm Internal Transfers
                </span>
                <span className="font-body text-body-sm text-on-surface-variant">
                  Skip the destination location confirmation scan if the receiving location matches the requested transfer destination.
                </span>
              </label>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-3 border-t border-outline-variant/30 pt-6">
            <button
              type="submit"
              className="flex h-11 items-center justify-center gap-2 rounded bg-primary px-6 font-label text-label tracking-wide text-white transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Save size={18} aria-hidden="true" />
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
