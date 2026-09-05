import { createPageResolver } from "@/lib/auth/page-resolver";
import { OperationsDashboard } from "@/components/dashboard/OperationsDashboard";

export const metadata = {
  title: "WMS Operations Dashboard | Dyna-Serv WIMS",
  description: "Real-time warehouse operations telemetry, inventory valuation, location heatmap, and performance metrics.",
};

export default async function DashboardPage() {
  await createPageResolver();

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <OperationsDashboard />
    </div>
  );
}
