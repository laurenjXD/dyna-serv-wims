import { createPageResolver } from "@/lib/auth/page-resolver";
import { ClientRouteRedirect } from "@/app/(authenticated)/_components/ClientRouteRedirect";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "WIMS Dashboard | Dyna-Serv WIMS",
};

export default async function DashboardPage() {
  await createPageResolver();
  return <ClientRouteRedirect href="/" />;
}
