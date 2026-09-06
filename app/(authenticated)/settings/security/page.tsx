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
    return <ShellStateView state={{ kind: "forbidden" }} />;
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

      <SecuritySettingsView
        initialSettings={settingsRes.data}
        initialSessions={sessionsRes.data}
        initialEvents={eventsRes.data}
      />
    </div>
  );
}
