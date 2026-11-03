// `/settings/general` — Facility, BYOD Scanner Configuration, and Floor Alerts.
// Gated by RouteGuard(capability: "users.read") in layout.tsx.

import { SettingsUnavailable } from "../_components/SettingsUnavailable";
import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import { ShellStateView } from "@/components/global/ShellStateView";
import { getGeneralSettings } from "./actions";

export default async function SettingsGeneralPage() {
  const result = await getGeneralSettings();

  if (!result.ok) {
    return result.reason === "forbidden" ? <ShellStateView state={{ kind: "forbidden" }} /> : <SettingsUnavailable title="General settings could not be loaded." error={result.error} href="/settings/general" />;
  }

  return <div className="space-y-4">
    {result.isDefault && <p role="status" className="font-body text-body-md text-on-surface">No general settings have been saved. The form shows initial defaults. Review them before saving.</p>}
    <GeneralSettingsForm initialSettings={result.data} />
  </div>;
}
