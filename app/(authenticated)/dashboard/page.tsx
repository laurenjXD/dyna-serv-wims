import { createPageResolver } from "@/lib/auth/page-resolver";
import { OperationsDashboard } from "@/components/dashboard/OperationsDashboard";
import {
  getDashboardKpis,
  getDashboardMonthlyFlow,
  getDashboardLocationOccupancy,
  getDashboardDeliveryPerformance,
  getDashboardHeatmapData,
  getDashboardMasterInventory,
} from "@/lib/db/queries/dashboard";

export const metadata = {
  title: "WMS Operations Dashboard | Dyna-Serv WIMS",
  description: "Real-time warehouse operations telemetry, inventory valuation, location heatmap, and performance metrics.",
};

export default async function DashboardPage() {
  await createPageResolver();

  // Load all live telemetry in parallel
  const [
    kpis,
    flowData,
    occupancyData,
    deliveryPerformance,
    heatmapGrid,
    masterInventoryResult,
  ] = await Promise.all([
    getDashboardKpis(),
    getDashboardMonthlyFlow(),
    getDashboardLocationOccupancy(),
    getDashboardDeliveryPerformance(),
    getDashboardHeatmapData(),
    getDashboardMasterInventory({ limit: 50 }),
  ]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <OperationsDashboard
        kpis={kpis}
        flowData={flowData}
        occupancyData={occupancyData}
        deliveryPerformance={deliveryPerformance}
        heatmapGrid={heatmapGrid}
        masterInventory={masterInventoryResult.items}
      />
    </div>
  );
}
