import { ClientRouteRedirect } from "@/app/(authenticated)/_components/ClientRouteRedirect";

export default function ContractListPage() {
  return <ClientRouteRedirect href="/billing-pricing?section=configuration&subtab=contracts" />;
}
