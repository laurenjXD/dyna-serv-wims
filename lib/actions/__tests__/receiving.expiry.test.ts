import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commitWrrLine } from "../receiving";
import { expiryReviewKey } from "@/lib/inventory/expiry-policy";
import { mockRlsDeps, DEFAULT_MOCK_USER_ID } from "@/lib/db/__tests__/helpers/mock-rls";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";

vi.mock("@/app/(authenticated)/settings/security/actions", () => ({ verifyFloorNetworkAccess: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/notifications/quarantine", () => ({ emitQuarantineAlert: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/low-stock", () => ({ emitLowStockAlerts: vi.fn(async () => undefined) }));

const now = new Date("2026-11-04T04:00:00Z");
const itemId="00000000-0000-4000-8000-000000000003", lineId="00000000-0000-4000-8000-000000000006";
const wrrId="00000000-0000-4000-8000-000000000005", locationId="00000000-0000-4000-8000-000000000008";
const resolver: RequestAuthorizationResolver = { getContext: async () => ({ kind: "authorized", context: {
  userId: DEFAULT_MOCK_USER_ID, profileStatus: "active", activeRoleKeys: ["warehouse_staff"],
  grants: [{ resource: "receiving", action: "confirm", scopeKind: "global" }], partyScopes: [],
} }) };

// Deliberately table-based fixture: query ordering is not part of the contract.
function fixture(policy: string, destination: "storage" | "inspection" = "storage") {
  const writes: Array<{ table: string; value: unknown }> = [];
  const catalog = { id:itemId,spq:12,isPerishable:false,expiryPolicy:policy,expiryPolicyVersion:1,barcode:"MAT-1",code:"MAT-1" };
  const line = { id:lineId,wrrId,itemId,lotNumber:"LOT-1",expectedQty:24,scannedQty:2,unitCbm:0.1,uom:"piece",expiryDate:"2026-11-03",disposition:"store",committedAt:null };
  const doc = { id:wrrId,wrrNumber:"WRR-1",status:"receiving_in_progress",flowType:"trading",vendorPartyId:"org-1",stagedByUserId:DEFAULT_MOCK_USER_ID };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain = (rows: unknown[]): any => {
    const result: Record<string, unknown> = {};
    for (const method of ["from","where","leftJoin","innerJoin","orderBy","limit","for","onConflictDoNothing","onConflictDoUpdate"]) result[method] = vi.fn(() => result);
    result.returning = vi.fn(async () => rows);
    result.then = Promise.resolve(rows).then.bind(Promise.resolve(rows));
    return result;
  };
  const db = {
    execute:vi.fn(async () => []),
    select:vi.fn(() => {
      const result=chain([]);
      result.from=vi.fn((table) => {
        const name=table[Symbol.for("drizzle:Name")];
        if(name==="wrr_documents") return chain([{wrr_documents:doc,wrr_items:line,items:catalog}]);
        if(name==="items") return chain([catalog]);
        if(name==="wrr_items") return chain([line]);
        if(name==="locations") return chain([{id:locationId,isActive:true,locationType:destination}]);
        return chain([]);
      });
      return result;
    }),
    insert:vi.fn((table) => ({values:vi.fn((value) => { writes.push({table:table[Symbol.for("drizzle:Name")],value}); return chain([{id:"new-lot"}]); })})),
    update:vi.fn((table) => ({set:vi.fn((value) => { writes.push({table:table[Symbol.for("drizzle:Name")],value}); return chain([{id:lineId}]); })})),
  };
  return { db,writes };
}

describe("R3 receiving expired material", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => vi.useRealTimers());

  it("blocks expired Block release material from Storage without making any stock writes", async () => {
    const {db,writes}=fixture("block_release");
    const result=await commitWrrLine(resolver,wrrId,lineId,{locationId},mockRlsDeps(db).deps);
    expect(result.ok).toBe(false);
    if(!result.ok) expect(result.errors.join(" ")).toMatch(/expir/i);
    expect(writes).toEqual([]);
  });

  it("permits block-policy expired material to enter Inspection as quarantined stock", async () => {
    const {db,writes}=fixture("block_release","inspection");
    const result=await commitWrrLine(resolver,wrrId,lineId,{locationId},mockRlsDeps(db).deps);
    expect(result.ok).toBe(true);
    expect(writes.find((entry)=>entry.table==="lots")?.value).toMatchObject({status:"quarantined"});
    expect(writes.some((entry)=>entry.table==="inspection_cases")).toBe(true);
    expect(writes.some((entry)=>entry.table==="expiry_acknowledgements")).toBe(false);
  });

  it("requires acknowledgement for permissive expired Storage receipt", async () => {
    const {db,writes}=fixture("allow_with_acknowledgement");
    const result=await commitWrrLine(resolver,wrrId,lineId,{locationId},mockRlsDeps(db).deps);
    expect(result.ok).toBe(false);
    if(!result.ok) expect(result.errors.join(" ")).toMatch(/acknowledg/i);
    expect(writes).toEqual([]);
  });

  it("rejects a stale quantity review and blank reason before receipt mutation", async () => {
    const {db,writes}=fixture("allow_with_acknowledgement");
    const params={locationId,expiryAcknowledgement:{acknowledged:true,reason:" ",reviewKey:"stale"}};
    const result=await commitWrrLine(resolver,wrrId,lineId,params,mockRlsDeps(db).deps);
    expect(result.ok).toBe(false);
    expect(writes).toEqual([]);
  });

  it("persists exact receiving acknowledgement before the receiving ledger is posted", async () => {
    const {db,writes}=fixture("allow_with_acknowledgement");
    const lines=[{itemId,lotId:lineId,locationId,qty:24,expiryDate:"2026-11-03",expiryPolicy:"allow_with_acknowledgement" as const,expiryPolicyVersion:1}];
    const params={locationId,expiryAcknowledgement:{acknowledged:true,reason:"Material request reviewed",reviewKey:expiryReviewKey(lines,now)}};
    const result=await commitWrrLine(resolver,wrrId,lineId,params,mockRlsDeps(db).deps);
    expect(result.ok).toBe(true);
    const evidence=writes.findIndex((entry)=>entry.table==="expiry_acknowledgements");
    expect(evidence).toBeGreaterThanOrEqual(0);
    expect(evidence).toBeLessThan(writes.findIndex((entry)=>entry.table==="inventory_transactions"));
    expect(writes[evidence].value).toMatchObject({stage:"receiving",sourceId:lineId,reason:"Material request reviewed",actorUserId:DEFAULT_MOCK_USER_ID});
  });
});
