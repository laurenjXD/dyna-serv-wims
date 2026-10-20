export const DEFAULT_MIGRATION_VOLUME_CBM = 0.0001;

/**
 * `items.volume_cbm` is required to be positive and is stored at four
 * decimal places. Keep the documented migration fallback positive after
 * decimal rounding as well as when the workbook value is missing or zero.
 */
export function migrationVolumeCbm(value: number | undefined): string {
  const numeric = typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_MIGRATION_VOLUME_CBM;
  return Math.max(numeric, DEFAULT_MIGRATION_VOLUME_CBM).toFixed(4);
}
