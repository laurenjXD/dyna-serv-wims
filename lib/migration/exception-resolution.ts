export const MIGRATION_RESOLUTION_CATEGORIES = [
  { value: "fallback_accepted", label: "Use fallback", effect: "The system keeps the row and uses its safe fallback value." },
  { value: "accepted_as_is", label: "Accept as is", effect: "The system keeps the imported value without changing it." },
  { value: "other", label: "Other", effect: "The note explains the decision recorded for this warning." },
] as const;

export type MigrationResolutionCategory = typeof MIGRATION_RESOLUTION_CATEGORIES[number]["value"];

export function isMigrationResolutionCategory(value: string): value is MigrationResolutionCategory {
  return MIGRATION_RESOLUTION_CATEGORIES.some((category) => category.value === value);
}
