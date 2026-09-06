// `/settings/general` — Facility, BYOD Scanner Configuration, and Floor Alerts.
// Gated by RouteGuard(capability: "users.read") in layout.tsx.

import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import { ShellStateView } from "@/components/global/ShellStateView";
import { getGeneralSettings } from "./actions";

export default async function SettingsGeneralPage() {
  const result = await getGeneralSettings();

  if (!result.ok) {
    return <ShellStateView state={{ kind: "forbidden" }} />;
  }

  return <GeneralSettingsForm initialSettings={result.data} />;
}
