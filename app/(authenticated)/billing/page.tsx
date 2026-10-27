import { ClientRouteRedirect } from "@/app/(authenticated)/_components/ClientRouteRedirect";

export default function BillingRedirectPage() {
  return <ClientRouteRedirect href="/billing-pricing" />;
}
