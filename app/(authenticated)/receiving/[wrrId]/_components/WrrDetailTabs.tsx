"use client";

import React, { useState } from "react";
import { Package, MapPin } from "lucide-react";
import type { WrrPutawayAllocationRow } from "@/lib/db/queries/receiving";
import { PutawayRoutingChecklist } from "./PutawayRoutingChecklist";

interface WrrDetailTabsProps {
  wrrId: string;
  wrrNumber: string;
  itemsCount: number;
  allocations: WrrPutawayAllocationRow[];
  shipmentDetailsContent: React.ReactNode;
}

export function WrrDetailTabs({
  wrrId,
  wrrNumber,
  itemsCount,
  allocations,
  shipmentDetailsContent,
}: WrrDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<"items" | "putaway">("items");

  const hasAllocations = allocations.length > 0;

  return (
    <div className="mt-6 space-y-4">
      {/* Subtab Navigation Bar */}
      <div className="flex border-b border-outline-variant/30">
        <button
          type="button"
          onClick={() => setActiveTab("items")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 font-label text-body-md font-bold transition-colors focus:outline-none ${
            activeTab === "items"
              ? "border-primary text-primary"
              : "border-transparent text-text-grey hover:text-on-surface"
          }`}
        >
          <Package size={18} />
          <span>Shipment Line Items ({itemsCount})</span>
        </button>

        {hasAllocations && (
          <button
            type="button"
            onClick={() => setActiveTab("putaway")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 font-label text-body-md font-bold transition-colors focus:outline-none ${
              activeTab === "putaway"
                ? "border-primary text-primary"
                : "border-transparent text-text-grey hover:text-on-surface"
            }`}
          >
            <MapPin size={18} />
            <span>Putaway Routing Checklist ({allocations.length})</span>
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "items" && shipmentDetailsContent}
        {activeTab === "putaway" && (
          <PutawayRoutingChecklist
            wrrId={wrrId}
            wrrNumber={wrrNumber}
            allocations={allocations}
          />
        )}
      </div>
    </div>
  );
}
