import type { WrrItemOption } from "@/lib/db/queries/items";

/** New WRR writes require an explicit material-to-source Organization assignment. */
export function filterReceivingItemOptions(
  itemOptions: WrrItemOption[],
  vendorPartyId: string,
): WrrItemOption[] {
  if (!vendorPartyId) return [];

  const normalizedVendorPartyId = vendorPartyId.trim().toLowerCase();

  return itemOptions.filter(
    (item) => {
      const assignedPartyId = item.defaultSupplierPartyId?.trim().toLowerCase();
      return Boolean(assignedPartyId) && assignedPartyId === normalizedVendorPartyId;
    },
  );
}
