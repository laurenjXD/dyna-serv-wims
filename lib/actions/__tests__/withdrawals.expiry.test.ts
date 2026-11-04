import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commitWithdrawal, dispatchPickList } from "../withdrawals";
import { expiryReviewKey } from "@/lib/inventory/expiry-policy";
import { mockRlsDeps, DEFAULT_MOCK_USER_ID } from "@/lib/db/__tests__/helpers/mock-rls";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";

vi.mock("@/app/(authenticated)/settings/security/actions", () => ({ verifyFloorNetworkAccess: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/notifications/low-stock", () => ({ emitLowStockAlerts: vi.fn(async () => undefined) }));
const now=new Date("2026-11-04T04:00:00Z");
const resolver: RequestAuthorizationResolver={getContext:async()=>({kind:"authorized",context:{
  userId:DEFAULT_MOCK_USER_ID,profileStatus:"active",activeRoleKeys:["supervisor"],partyScopes:[],
  grants:[{resource:"pick_list",action:"generate",scopeKind:"global"},{resource:"dispatch",action:"execute",scopeKind:"global"}],
}})};

function fixture(policy: "block_release" | "allow_with_acknowledgement", generation=false) {
  const writes:Array<{table:string;value:unknown}>=[];
  const stock={balanceId:"balance-1",qtyRemaining:24,qtyCommitted:0,allocationVersion:1,itemId:"item-1",itemCode:"MAT-1",
    supplierItemCode:"MAT-1",dsgcItemNumber:"MAT-1",organizationPartyId:"owner-1",defaultSupplierPartyId:"owner-1",isPerishable:false,
    expiryPolicy:policy,expiryPolicyVersion:1,spq:12,lotId:"lot-1",lotNumber:"LOT-1",lotStatus:"available",lotFlowType:"vmi",
    receivedAt:new Date("2026-10-01T00:00:00Z"),expiryDate:"2026-11-03",locationId:"location-1",locationLabel:"A-1"};
  const line={id:"line-1",itemId:"item-1",lotId:"lot-1",locationId:"location-1",qty:12,numberOfBoxes:1,
    expiryDate:stock.expiryDate,expiryPolicy:policy,expiryPolicyVersion:1,lotStatus:"available",isPerishable:false};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain=(rows:unknown[]):any=>{
    const result:Record<string,unknown>={};
    for(const method of ["from","where","leftJoin","innerJoin","orderBy","limit","for","onConflictDoNothing"]) result[method]=vi.fn(()=>result);
    result.returning=vi.fn(async()=>rows);
    result.then=Promise.resolve(rows).then.bind(Promise.resolve(rows));return result;
  };
  const db={
    execute:vi.fn(async()=>[]),
    select:vi.fn(()=>{const result=chain([]);result.from=vi.fn((table)=>{
      const name=table[Symbol.for("drizzle:Name")];
      if(name==="parties") return chain([
        {id:"owner-1",isActive:true,role:"customer",relationship:"vmi_customer",relationshipIsActive:true},
        {id:"recipient-1",isActive:true,role:"end_customer",relationship:null,relationshipIsActive:true},
      ]);
      if(name==="pick_lists") return chain(generation?[]:[{id:"pick-1",status:"picked",flowType:"vmi",customerPartyId:"owner-1"}]);
      if(name==="pick_list_items") return chain([line]);
      if(name==="lot_location_balances") return chain(generation?[stock]:[{id:"balance-1",qtyRemaining:24,qtyCommitted:12}]);
      if(name==="inventory_commitments") return chain([{id:"commit-1",status:"active",expiresAt:new Date("2026-11-05T04:00:00Z")}]);
      if(name==="inventory_commitment_lines") return chain([{id:"commit-line-1"}]);
      if(name==="inventory_units") return chain([{id:"unit-1",pickListItemId:"line-1"}]);
      return chain([]);
    });return result;}),
    insert:vi.fn((table)=>({values:vi.fn((value)=>{writes.push({table:table[Symbol.for("drizzle:Name")],value});return chain([{id:"new-id"}]);})})),
    update:vi.fn((table)=>({set:vi.fn((value)=>{writes.push({table:table[Symbol.for("drizzle:Name")],value});return chain([{id:"balance-1"}]);})})),
  };
  const reviewLines=[{itemId:line.itemId,lotId:line.lotId,locationId:line.locationId,qty:line.qty,expiryDate:line.expiryDate,expiryPolicy:policy,expiryPolicyVersion:1}];
  return {db,writes,reviewLines};
}

describe("R5/R6 authoritative outbound expiry enforcement",()=>{
  beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(now);});
  afterEach(()=>vi.useRealTimers());
  it("refuses block-policy stock during generation without reservation writes",async()=>{
    const {db,writes}=fixture("block_release",true);
    const result=await commitWithdrawal(resolver,{partyId:"owner-1",endCustomerPartyId:"recipient-1",flowType:"vmi",lines:[{itemId:"item-1",lotId:"lot-1",locationId:"location-1",qty:12}],idempotencyKey:"expiry-generation-1"},mockRlsDeps(db).deps);
    expect(result.ok).toBe(false);expect(writes).toEqual([]);
  });
  it("refuses permissive past-expiry generation without a reviewed acknowledgement",async()=>{
    const {db,writes}=fixture("allow_with_acknowledgement",true);
    const result=await commitWithdrawal(resolver,{partyId:"owner-1",endCustomerPartyId:"recipient-1",flowType:"vmi",lines:[{itemId:"item-1",lotId:"lot-1",locationId:"location-1",qty:12}],idempotencyKey:"expiry-generation-2"},mockRlsDeps(db).deps);
    expect(result).toMatchObject({ok:false,errors:["expiry_acknowledgement_required"]});expect(writes).toEqual([]);
  });
  it("blocks an expired reservation at dispatch before any stock mutation",async()=>{
    const {db,writes}=fixture("block_release");
    const result=await dispatchPickList(resolver,"pick-1",["line-1"],mockRlsDeps(db).deps);
    expect(result).toMatchObject({ok:false,errors:["material_expiry_blocked"]});expect(writes).toEqual([]);
  });
  it("requires a separate acknowledgement at dispatch",async()=>{
    const {db,writes}=fixture("allow_with_acknowledgement");
    const result=await dispatchPickList(resolver,"pick-1",["line-1"],mockRlsDeps(db).deps);
    expect(result).toMatchObject({ok:false,errors:["expiry_acknowledgement_required"]});expect(writes).toEqual([]);
  });
  it("rejects a stale dispatch review after a quantity or policy-version edit",async()=>{
    const {db,writes,reviewLines}=fixture("allow_with_acknowledgement");
    const acknowledgement={acknowledged:true,reason:"Material requested",reviewKey:expiryReviewKey([{...reviewLines[0],qty:24,expiryPolicyVersion:2}],now)};
    const result=await dispatchPickList(resolver,"pick-1",["line-1"],mockRlsDeps(db).deps,acknowledgement);
    expect(result).toMatchObject({ok:false,errors:["expiry_acknowledgement_required"]});expect(writes).toEqual([]);
  });
  it("writes stage-specific evidence before the confirmed dispatch movement",async()=>{
    const {db,writes,reviewLines}=fixture("allow_with_acknowledgement");
    const acknowledgement={acknowledged:true,reason:"Material requested",reviewKey:expiryReviewKey(reviewLines,now)};
    const result=await dispatchPickList(resolver,"pick-1",["line-1"],mockRlsDeps(db).deps,acknowledgement);
    expect(result.ok).toBe(true);
    const evidence=writes.findIndex((entry)=>entry.table==="expiry_acknowledgements");
    expect(evidence).toBeGreaterThanOrEqual(0);expect(evidence).toBeLessThan(writes.findIndex((entry)=>entry.table==="inventory_transactions"));
    expect(writes[evidence].value).toMatchObject({stage:"dispatch",sourceId:"pick-1",actorUserId:DEFAULT_MOCK_USER_ID,reason:"Material requested"});
    expect(writes.filter((entry)=>entry.table==="inventory_transactions")).toHaveLength(1);
  });
});
