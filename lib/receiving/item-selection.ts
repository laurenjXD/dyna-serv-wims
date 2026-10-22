import type { WrrItemOption } from "@/lib/db/queries/items";

/**
 * An item may be enrolled before its default supplier is known. Keep those
 * catalog items selectable for receiving; the WRR organization still records
 * who supplied this particular shipment.
 */
export function filterReceivingItemOptions(
  itemOptions: WrrItemOption[],
  vendorPartyId: string,
): WrrItemOption[] {
  if (!vendorPartyId) return [];

  return itemOptions.filter(
    (item) => item.defaultSupplierPartyId === vendorPartyId || item.defaultSupplierPartyId === null,
  );
}
