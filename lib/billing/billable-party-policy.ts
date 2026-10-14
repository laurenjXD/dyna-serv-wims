export type BillablePartyDecision = {
  canReceiveSoa: boolean;
  canReceiveBilling: boolean;
  invoicePayee: "dyna_serv" | "party" | "none";
};

/** Shared fail-closed financial boundary for party-role decisions. */
export function getBillablePartyDecision(roles: readonly string[]): BillablePartyDecision {
  const normalized = new Set(roles.map((role) => role.toLowerCase()));
  if (normalized.has("end_customer") && !normalized.has("customer")) {
    return { canReceiveSoa: false, canReceiveBilling: false, invoicePayee: "none" };
  }
  if (normalized.has("supplier") && !normalized.has("customer")) {
    return { canReceiveSoa: false, canReceiveBilling: false, invoicePayee: "dyna_serv" };
  }
  if (normalized.has("customer")) {
    return { canReceiveSoa: true, canReceiveBilling: false, invoicePayee: "party" };
  }
  return { canReceiveSoa: false, canReceiveBilling: false, invoicePayee: "none" };
}
