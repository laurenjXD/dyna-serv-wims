export type BillingSection = "overview" | "ledger" | "soa" | "configuration";

export function resolveBillingSection(
  sectionParam?: string,
  tabParam?: string,
): BillingSection {
  const active = (sectionParam || tabParam || "overview").toLowerCase();

  if (active === "overview") return "overview";
  if (active === "ledger" || active === "vmi" || active === "trading") return "ledger";
  if (active === "soa" || active === "statements") return "soa";
  if (active === "configuration" || active === "contracts" || active === "vmi-contracts" || active === "logistics-rates" || active === "policies") {
    return "configuration";
  }

  return "overview";
}

export function resolveBillingTab(
  section: BillingSection,
  tabParam?: string,
): "overview" | "ledger" | "soa" | "configuration" {
  return section;
}

