import { ClientRouteRedirect } from "@/app/(authenticated)/_components/ClientRouteRedirect";

export default function SettingsIndexPage() {
  return <ClientRouteRedirect href="/settings/general" />;
}
