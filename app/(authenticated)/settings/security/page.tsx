import { SettingsUnavailable } from "../_components/SettingsUnavailable";
import { getSecuritySettings, listActiveSessions, getSystemAuditEvents } from "./actions";
import { SecuritySettingsView } from "@/components/settings/SecuritySettingsView";
import { ShellStateView } from "@/components/global/ShellStateView";

export default async function SettingsSecurityPage() {
  const [settingsRes, sessionsRes, eventsRes] = await Promise.all([
    getSecuritySettings(),
    listActiveSessions(),
    getSystemAuditEvents(),
  ]);

  if (!settingsRes.ok || !sessionsRes.ok || !eventsRes.ok) {
    const failure = !settingsRes.ok ? settingsRes : !sessionsRes.ok ? sessionsRes : !eventsRes.ok ? eventsRes : null;
    return failure?.reason === "forbidden" ? <ShellStateView state={{ kind: "forbidden" }} /> : <SettingsUnavailable title="Security settings could not be loaded." error={failure?.error ?? "Refresh the page to try again."} href="/settings/security" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-headline-md font-extrabold text-on-surface">
          Security &amp; BYOD Governance
        </h1>
        <p className="font-body text-body-md text-text-grey mt-1">
          Configure warehouse network isolation, authentication rules, BYOD floor sessions, and immutable system audit ledger.
        </p>
      </div>

      {settingsRes.isDefault && <p role="status" className="font-body text-body-md text-on-surface">No security settings have been saved. The form shows initial defaults. Review them before saving.</p>}
      <SecuritySettingsView
        initialSettings={settingsRes.data}
        initialSessions={sessionsRes.data}
        initialEvents={eventsRes.data}
      />
    </div>
  );
}
