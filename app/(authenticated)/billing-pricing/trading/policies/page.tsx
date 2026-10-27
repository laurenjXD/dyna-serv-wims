import { ClientRouteRedirect } from "@/app/(authenticated)/_components/ClientRouteRedirect";

export default function TradingPoliciesRedirectPage() {
  return <ClientRouteRedirect href="/billing-pricing?section=configuration&subtab=logistics" />;
}
