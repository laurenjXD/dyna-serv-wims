import type { WrrItemOption } from "@/lib/db/queries/items";

/**
 * WRR lines must use a material enrolled to the selected source Organization.
 * An unassigned catalog item is not a valid receiving-line candidate because
 * it has no Organization relationship from which to inherit the WRR context.
 */
export function filterReceivingItemOptions(
  itemOptions: WrrItemOption[],
  vendorPartyId: string,
): WrrItemOption[] {
  if (!vendorPartyId) return [];

  const normalizedVendorPartyId = vendorPartyId.trim().toLowerCase();

  return itemOptions.filter(
    (item) => item.defaultSupplierPartyId?.trim().toLowerCase() === normalizedVendorPartyId,
  );
}
