import { ShieldAlert } from "lucide-react";

export default function SettingsAuditLogPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-headline-md font-extrabold text-on-surface">
          Audit Log
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          System-wide audit trail of security and configuration events. Note: this is a placeholder.
        </p>
      </div>

      <div className="rounded-2xl border border-outline-variant/30 bg-white p-8 text-center shadow-elevation-1">
        <ShieldAlert size={48} className="mx-auto text-status-warning" aria-hidden="true" />
        <h2 className="mt-4 font-heading text-headline-sm font-semibold text-on-surface">
          Audit Log Not Yet Connected
        </h2>
        <p className="mx-auto mt-2 max-w-lg font-body text-body-md text-on-surface-variant">
          The backing table for the system audit log is currently under development. Once complete, this view will list role assignments, authentication events, and administrative configuration changes.
        </p>
      </div>
    </div>
  );
}
