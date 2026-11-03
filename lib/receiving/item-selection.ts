import type { WrrItemOption } from "@/lib/db/queries/items";

/**
 * WRR lines are scoped to the selected source Organization when an item has an
 * assignment. Legacy/imported catalog rows may have no assignment yet; those
 * rows remain selectable because the WRR itself supplies the source
 * organization and the line's enrolled item ID is still required for floor
 * scanning and dispatch.
 */
export function filterReceivingItemOptions(
  itemOptions: WrrItemOption[],
  vendorPartyId: string,
): WrrItemOption[] {
  if (!vendorPartyId) return [];

  const normalizedVendorPartyId = vendorPartyId.trim().toLowerCase();

  return itemOptions.filter(
    (item) => {
      const assignedPartyId = item.defaultSupplierPartyId?.trim().toLowerCase();
      return !assignedPartyId || assignedPartyId === normalizedVendorPartyId;
    },
  );
}
