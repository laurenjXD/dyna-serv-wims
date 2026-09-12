export type BillingSection = "overview" | "vmi" | "trading" | "configuration";

export function resolveBillingSection(
  sectionParam?: string,
  tabParam?: string,
): BillingSection {
  if (sectionParam === "overview") return "overview";
  if (sectionParam === "vmi") return "vmi";
  if (sectionParam === "trading") return "trading";
  if (sectionParam === "configuration") return "configuration";

  if (tabParam === "trading" || tabParam === "policies") return "trading";
  if (tabParam === "vmi-contracts" || tabParam === "logistics-rates") {
    return "configuration";
  }

  return "vmi";
}

export function resolveBillingTab(
  section: BillingSection,
  tabParam?: string,
): "overview" | "vmi" | "trading" | "policies" | "vmi-contracts" | "logistics-rates" {
  if (section === "overview") return "overview";
  if (section === "vmi") return tabParam === "vmi" ? "vmi" : "vmi";
  if (section === "trading") {
    return tabParam === "policies" ? "policies" : "trading";
  }
  return tabParam === "vmi-contracts" ? "vmi-contracts" : "logistics-rates";
}
