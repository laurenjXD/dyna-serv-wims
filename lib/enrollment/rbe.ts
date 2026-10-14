export const RBE_CLASSIFICATIONS = ["ee", "else", "etc"] as const;
export type RbeClassification = (typeof RBE_CLASSIFICATIONS)[number];

export type RbeValidation =
  | { valid: true; values: RbeClassification[] }
  | { valid: false; reason: string };

export function validateRbeSelection(
  values: readonly unknown[],
  hasCustomerRole: boolean,
): RbeValidation {
  const normalized = values.map((value) => String(value).trim().toLowerCase());
  if (normalized.some((value) => !RBE_CLASSIFICATIONS.includes(value as RbeClassification))) {
    return { valid: false, reason: "RBE classification must be EE, ELSE, or ETC." };
  }
  const unique = [...new Set(normalized)] as RbeClassification[];
  if (unique.length > 3) {
    return { valid: false, reason: "Select no more than three RBE classifications." };
  }
  if (unique.length > 0 && !hasCustomerRole) {
    return { valid: false, reason: "RBE classifications are available only for Customer enrollment." };
  }
  return { valid: true, values: unique };
}
