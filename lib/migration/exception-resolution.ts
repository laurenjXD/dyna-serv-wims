export const MIGRATION_RESOLUTION_CATEGORIES = [
  { value: "source_corrected", label: "Source workbook corrected" },
  { value: "fallback_accepted", label: "Fallback accepted" },
  { value: "matched_record", label: "Matched to canonical record" },
  { value: "intentionally_excluded", label: "Intentionally excluded" },
  { value: "other", label: "Other" },
] as const;

export type MigrationResolutionCategory = typeof MIGRATION_RESOLUTION_CATEGORIES[number]["value"];

export function isMigrationResolutionCategory(value: string): value is MigrationResolutionCategory {
  return MIGRATION_RESOLUTION_CATEGORIES.some((category) => category.value === value);
}
