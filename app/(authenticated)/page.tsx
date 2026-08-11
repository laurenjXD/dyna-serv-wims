import Link from "next/link";
import { eq } from "drizzle-orm";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { resolveSessionPresentationTier } from "@/lib/shell/surface";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";

function getGreetingPeriod(hour: number): string {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function getTodayString(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function FloorLanding({
  firstName,
  openWrrs,
  openPickLists,
  pendingTransfers,
}: {
  firstName: string;
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
}) {
  return (
    <>
      <div className="py-md">
        <p className="font-body-md text-on-surface-variant mb-1">Welcome back, {firstName}</p>
        <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-sm">Shift Overview</h2>
      </div>
      
      <div className="grid grid-cols-1 gap-md">
        <Link href="/receiving" className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md flex items-center justify-between active:border-tertiary-container active:border-2 transition-all">
          <div className="flex items-center gap-md">
            <div className="w-12 h-12 rounded-full bg-error-container text-on-error-container flex items-center justify-center">
              <span className="material-symbols-outlined">assignment_late</span>
            </div>
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">{openWrrs} WRRs</h3>
              <p className="font-body-sm text-on-surface-variant">Pending Processing</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-outline">chevron_right</span>
        </Link>
        
        <Link href="/outgoing" className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md flex items-center justify-between active:border-tertiary-container active:border-2 transition-all">
          <div className="flex items-center gap-md">
            <div className="w-12 h-12 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
              <span className="material-symbols-outlined">shopping_cart</span>
            </div>
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">{openPickLists} Picks</h3>
              <p className="font-body-sm text-on-surface-variant">Remaining in Queue</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-outline">chevron_right</span>
        </Link>

        <Link href="/transfers" className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md flex items-center justify-between active:border-tertiary-container active:border-2 transition-all">
          <div className="flex items-center gap-md">
            <div className="w-12 h-12 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined">policy</span>
            </div>
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">{pendingTransfers} Items</h3>
              <p className="font-body-sm text-on-surface-variant">In Transfer/Inspection</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-outline">chevron_right</span>
        </Link>
      </div>

      <div className="mt-lg">
        <Link href="/scan" className="w-full h-14 bg-primary text-on-primary rounded-lg font-headline-md text-headline-md flex items-center justify-center gap-sm active:scale-[0.98] transition-transform shadow-sm">
          <span className="material-symbols-outlined">barcode_scanner</span>
          Quick Scan
        </Link>
      </div>
    </>
  );
}

function OfficeLanding({
  openWrrs,
  openPickLists,
  pendingTransfers,
  pendingApprovals,
}: {
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
  pendingApprovals: number;
}) {
  return (
    <>
      <div className="md:hidden grid grid-cols-2 gap-sm mb-sm">
        <Link href="/receiving" className="bg-surface-container-lowest rounded-lg border border-outline-variant p-sm flex flex-col gap-xs">
          <div className="flex items-center gap-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">receipt_long</span>
            <span className="font-label-md text-label-md truncate">WRRs</span>
          </div>
          <div className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{openWrrs}</div>
        </Link>
        <Link href="/outgoing" className="bg-surface-container-lowest rounded-lg border border-outline-variant p-sm flex flex-col gap-xs">
          <div className="flex items-center gap-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">precision_manufacturing</span>
            <span className="font-label-md text-label-md truncate">Picks</span>
          </div>
          <div className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{openPickLists}</div>
        </Link>
        <Link href="/transfers" className="bg-surface-container-lowest rounded-lg border border-outline-variant p-sm flex flex-col gap-xs">
          <div className="flex items-center gap-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
            <span className="font-label-md text-label-md truncate">Transfers</span>
          </div>
          <div className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{pendingTransfers}</div>
        </Link>
        <Link href="/approvals" className="bg-surface-container-lowest rounded-lg border border-outline-variant p-sm flex flex-col gap-xs">
          <div className="flex items-center gap-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">fact_check</span>
            <span className="font-label-md text-label-md truncate">Approvals</span>
          </div>
          <div className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{pendingApprovals}</div>
        </Link>
      </div>

      <div className="md:hidden bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden mb-md">
        <div className="bg-surface-container-low px-md py-sm border-b border-outline-variant font-label-md text-label-md text-on-surface uppercase tracking-wider">Quick Jump</div>
        <div className="flex flex-col">
          <Link href="/receiving" className="flex items-center justify-between p-md border-b border-outline-variant active:bg-surface-container-high touch-manipulation">
            <div className="flex items-center gap-md">
              <span className="material-symbols-outlined text-primary">input</span>
              <span className="font-body-lg-mobile text-body-lg-mobile text-on-surface">Receiving Dock</span>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </Link>
          <Link href="/outgoing" className="flex items-center justify-between p-md border-b border-outline-variant active:bg-surface-container-high touch-manipulation">
            <div className="flex items-center gap-md">
              <span className="material-symbols-outlined text-primary">local_shipping</span>
              <span className="font-body-lg-mobile text-body-lg-mobile text-on-surface">Outbound Staging</span>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </Link>
          <Link href="/approvals" className="flex items-center justify-between p-md active:bg-surface-container-high touch-manipulation">
            <div className="flex items-center gap-md">
              <span className="material-symbols-outlined text-primary">fact_check</span>
              <span className="font-body-lg-mobile text-body-lg-mobile text-on-surface">Pending Approvals</span>
            </div>
            <div className="bg-error text-on-error font-label-md text-label-md px-2 py-0.5 rounded-full">{pendingApprovals}</div>
          </Link>
        </div>
      </div>

      <section className="hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
        <Link href="/receiving" className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md flex flex-col gap-sm relative overflow-hidden group hover:border-primary transition-colors">
          <div className="flex justify-between items-start">
            <span className="font-label-md text-label-md text-on-surface-variant">Open WRRs</span>
            <span className="material-symbols-outlined text-primary bg-primary-fixed p-xs rounded-md">receipt_long</span>
          </div>
          <div className="font-display-lg text-display-lg text-on-surface mt-sm">{openWrrs}</div>
          <div className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-xs">
            <span className="material-symbols-outlined text-[16px] text-error">trending_up</span>
            <span>+12% vs last week</span>
          </div>
          <div className="absolute bottom-0 left-0 h-1 bg-primary w-1/3"></div>
        </Link>
        
        <Link href="/outgoing" className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md flex flex-col gap-sm relative overflow-hidden hover:border-primary transition-colors">
          <div className="flex justify-between items-start">
            <span className="font-label-md text-label-md text-on-surface-variant">Active Picks</span>
            <span className="material-symbols-outlined text-primary bg-primary-fixed p-xs rounded-md">precision_manufacturing</span>
          </div>
          <div className="font-display-lg text-display-lg text-on-surface mt-sm">{openPickLists}</div>
          <div className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-xs">
            <span className="material-symbols-outlined text-[16px] text-primary">trending_flat</span>
            <span>On track for shift</span>
          </div>
          <div className="absolute bottom-0 left-0 h-1 bg-primary w-2/3"></div>
        </Link>

        <Link href="/transfers" className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md flex flex-col gap-sm relative overflow-hidden hover:border-primary transition-colors">
          <div className="flex justify-between items-start">
            <span className="font-label-md text-label-md text-on-surface-variant">Pending Transfers</span>
            <span className="material-symbols-outlined text-primary bg-primary-fixed p-xs rounded-md">swap_horiz</span>
          </div>
          <div className="font-display-lg text-display-lg text-on-surface mt-sm">{pendingTransfers}</div>
          <div className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-xs">
            <span className="material-symbols-outlined text-[16px] text-error">warning</span>
            <span>3 critical priority</span>
          </div>
          <div className="absolute bottom-0 left-0 h-1 bg-error w-full"></div>
        </Link>

        <Link href="/approvals" className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md flex flex-col gap-sm relative overflow-hidden cursor-pointer hover:border-primary transition-colors">
          <div className="flex justify-between items-start">
            <span className="font-label-md text-label-md text-on-surface-variant">Pending Approvals</span>
            <span className="material-symbols-outlined text-primary bg-primary-fixed p-xs rounded-md">fact_check</span>
          </div>
          <div className="font-display-lg text-display-lg text-on-surface mt-sm">{pendingApprovals}</div>
          <div className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-xs">
            <span>Requires attention</span>
          </div>
        </Link>
      </section>

      <div className="hidden md:grid grid-cols-1 lg:grid-cols-3 gap-lg">
        <section className="lg:col-span-2 bg-surface-container-lowest rounded-lg border border-outline-variant flex flex-col">
          <div className="p-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low rounded-t-lg">
            <h2 className="font-headline-md text-headline-md text-on-surface">Recent Activity</h2>
            <button className="font-label-md text-label-md text-primary hover:underline">View All</button>
          </div>
          <div className="flex flex-col p-sm gap-xs overflow-y-auto max-h-[400px]">
            <div className="flex items-start gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors">
              <div className="bg-primary-fixed p-sm rounded-full mt-xs"><span className="material-symbols-outlined text-primary text-[20px]">input</span></div>
              <div className="flex-1">
                <div className="font-body-md text-body-md text-on-surface font-semibold">PO-2023-8941 Received</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant mt-xs">Dock 4 • 2 pallets • Scanned by J. Doe</div>
              </div>
              <div className="font-label-md text-label-md text-on-surface-variant mt-xs whitespace-nowrap">10m ago</div>
            </div>
            
            <div className="flex items-start gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors">
              <div className="bg-surface-variant p-sm rounded-full mt-xs"><span className="material-symbols-outlined text-secondary text-[20px]">inventory_2</span></div>
              <div className="flex-1">
                <div className="font-body-md text-body-md text-on-surface font-semibold">Location Audit Completed</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant mt-xs">Aisle B-12 • 42 SKUs verified</div>
              </div>
              <div className="font-label-md text-label-md text-on-surface-variant mt-xs whitespace-nowrap">1h ago</div>
            </div>

            <div className="flex items-start gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors">
              <div className="bg-error-container p-sm rounded-full mt-xs"><span className="material-symbols-outlined text-on-error-container text-[20px]">gpp_bad</span></div>
              <div className="flex-1">
                <div className="font-body-md text-body-md text-on-surface font-semibold">Quarantine Flag Raised</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant mt-xs">SKU-9981 • Damage reported during picking</div>
              </div>
              <div className="font-label-md text-label-md text-on-surface-variant mt-xs whitespace-nowrap">2h ago</div>
            </div>

            <div className="flex items-start gap-md p-sm hover:bg-surface-container-low rounded-lg transition-colors">
              <div className="bg-primary-fixed p-sm rounded-full mt-xs"><span className="material-symbols-outlined text-primary text-[20px]">local_shipping</span></div>
              <div className="flex-1">
                <div className="font-body-md text-body-md text-on-surface font-semibold">Shipment Dispatched</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant mt-xs">Order #4402 • Carrier: Freightways</div>
              </div>
              <div className="font-label-md text-label-md text-on-surface-variant mt-xs whitespace-nowrap">3h ago</div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-md">
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant flex flex-col p-md">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-md">System Alerts</h2>
            <div className="flex flex-col gap-sm">
              <div className="bg-surface-container-low border border-outline-variant rounded p-sm flex items-start gap-sm">
                <span className="material-symbols-outlined text-secondary">info</span>
                <span className="font-body-sm text-body-sm text-on-surface">Scheduled maintenance window tonight at 02:00 AM EST.</span>
              </div>
            </div>
          </div>
          
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant flex-1 flex flex-col p-md min-h-[250px]">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-md">Throughput</h2>
            <div className="flex-1 relative rounded bg-surface-container-low border border-outline-variant overflow-hidden flex items-center justify-center">
              <div className="absolute bottom-0 left-0 w-full h-3/4 flex items-end gap-1 px-2 opacity-50">
                <div className="w-1/6 bg-primary-fixed-dim h-1/4 rounded-t-sm"></div>
                <div className="w-1/6 bg-primary-fixed-dim h-2/4 rounded-t-sm"></div>
                <div className="w-1/6 bg-primary-fixed h-3/4 rounded-t-sm"></div>
                <div className="w-1/6 bg-primary-fixed h-2/4 rounded-t-sm"></div>
                <div className="w-1/6 bg-primary h-full rounded-t-sm"></div>
                <div className="w-1/6 bg-primary-fixed-dim h-1/4 rounded-t-sm"></div>
              </div>
              <span className="font-mono-md text-mono-md text-on-surface-variant z-10 bg-surface-container-lowest px-sm py-xs border border-outline-variant rounded shadow-sm">Chart Placeholder</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

export default async function Home() {
  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();

  if (resolution.kind !== "authorized") {
    return null;
  }

  const { context } = resolution;
  const tier = resolveSessionPresentationTier(context.activeRoleKeys);

  const profileRows = await db
    .select({ displayName: userProfiles.displayName })
    .from(userProfiles)
    .where(eq(userProfiles.id, context.userId))
    .limit(1);
  const displayName = profileRows[0]?.displayName ?? "";
  const firstName = displayName.split(" ")[0] || "Admin";

  const openWrrs = 24; 
  const openPickLists = 18; 
  const pendingTransfers = 7; 
  const pendingApprovals = 4; 

  if (tier === "floor") {
    return (
      <FloorLanding
        firstName={firstName}
        openWrrs={openWrrs}
        openPickLists={openPickLists}
        pendingTransfers={pendingTransfers}
      />
    );
  }

  return (
    <OfficeLanding
      openWrrs={openWrrs}
      openPickLists={openPickLists}
      pendingTransfers={pendingTransfers}
      pendingApprovals={pendingApprovals}
    />
  );
}
