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

export const dynamic = "force-dynamic";

export const metadata = {
  title: "WMS Operations Dashboard | Dyna-Serv WIMS",
  description: "Real-time warehouse operations telemetry, inventory valuation, location heatmap, and performance metrics.",
};

function withDashboardTimeout<T>(promise: Promise<T>, timeoutMs = 6_000): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

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
    withDashboardTimeout(getDashboardKpis()),
    withDashboardTimeout(getDashboardMonthlyFlow()),
    withDashboardTimeout(getDashboardLocationOccupancy()),
    withDashboardTimeout(getDashboardDeliveryPerformance()),
    withDashboardTimeout(getDashboardHeatmapData()),
    withDashboardTimeout(getDashboardMasterInventory({ limit: 50 })),
  ]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <OperationsDashboard
        kpis={kpis}
        flowData={flowData}
        occupancyData={occupancyData}
        deliveryPerformance={deliveryPerformance}
        heatmapGrid={heatmapGrid}
        masterInventory={masterInventoryResult?.items}
      />
    </div>
  );
}
