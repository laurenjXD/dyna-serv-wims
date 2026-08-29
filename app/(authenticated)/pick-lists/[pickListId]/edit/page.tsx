// Pick List Edit Page — Allows modifying line items (Qty, SPQ, Boxes) of a queued pick list.

import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getPickList, getPickListItems } from "@/lib/db/queries/withdrawals";
import { EditPickListClient } from "./_components/EditPickListClient";

interface PageProps {
  params: Promise<{ pickListId: string }>;
}

export default async function EditPickListPage({ params }: PageProps) {
  const { pickListId } = await params;
  const resolver = await createPageResolver();

  const permResult = await requirePermission(resolver, "pick_list.execute");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const pickList = await getPickList(db, pickListId);
  if (!pickList || pickList.status === "dispatched") {
    notFound();
  }

  const rawItems = await getPickListItems(db, pickListId);

  const initialItems = rawItems.map((item) => ({
    id: item.id,
    itemId: item.itemId,
    itemCode: item.itemCode,
    customerItemCode: item.customerItemCode,
    itemDescription: item.itemDescription,
    lotNumber: item.lotNumber,
    locationLabel: item.locationLabel,
    qty: item.qty,
    spq: item.spq,
    numberOfBoxes: item.numberOfBoxes,
  }));

  return (
    <EditPickListClient
      pickListId={pickListId}
      pickListNumber={pickList.pickListNumber}
      status={pickList.status}
      initialItems={initialItems}
    />
  );
}
