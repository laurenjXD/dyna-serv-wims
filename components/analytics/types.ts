export type Trend = { direction: "up" | "down" | "flat"; pct: number };
export type StatusToken = "available" | "pending" | "held" | "neutral" | "expired";
export type FlowType = "vmi" | "trading" | "supplies" | "all";

export type StockLevelRow = {
  lotNumber: string;
  itemCode: string;
  itemName: string;
  flowType: Exclude<FlowType, "all">;
  ownerParty?: string;
  locationLabel: string;
  qtyAvailable: number;
  qtyCommitted: number;
  qtyRemaining: number;
  status: StatusToken;
  expiryDate?: string;
};

export type ActivityFeedItem = {
  transactionNumber: string;
  createdAt: string;
  movementType: string;
  flowType: Exclude<FlowType, "all">;
  itemCode: string;
  itemName: string;
  lotNumber: string;
  qty: number;
  partyName?: string;
  performedByName: string;
};

export type FlowMetrics = {
  lotCount: number;
  qtyAvailable: number;
  occupiedCbm: number;
  itemCount: number;
};
