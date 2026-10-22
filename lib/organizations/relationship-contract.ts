/**
 * Organization/Inventory Model relationship rules shared by forms and server
 * commands. Physical schema names remain party/flow_type for compatibility.
 */

export type InventoryModel = "vmi" | "trading" | "supplies";
export type OrganizationRelationship =
  | "vmi_customer"
  | "trading_customer"
  | "trading_supplier"
  | "internal_supplies";

export type OrganizationRelationshipRow = {
  id: string;
  isActive: boolean;
  role: string;
  relationship?: string | null;
  relationshipIsActive?: boolean | null;
};

export const RECEIVING_RELATIONSHIP_BY_MODEL: Record<InventoryModel, OrganizationRelationship> = {
  vmi: "vmi_customer",
  trading: "trading_supplier",
  supplies: "internal_supplies",
};

export const OUTBOUND_CUSTOMER_RELATIONSHIP_BY_MODEL: Partial<Record<InventoryModel, OrganizationRelationship>> = {
  vmi: "vmi_customer",
  trading: "trading_customer",
  supplies: "internal_supplies",
};

export function normalizeOrganizationRole(role: string): string {
  return role === "vendor"
    ? "supplier"
    : role === "internal_warehouse"
      ? "internal_supplies"
      : role;
}

export function activeOrganizationRelationships(
  rows: OrganizationRelationshipRow[],
): Set<OrganizationRelationship> {
  const relationships = new Set<OrganizationRelationship>();
  for (const row of rows) {
    if (!row.isActive || row.relationshipIsActive === false) continue;
    const role = normalizeOrganizationRole(row.role);
    const explicit = row.relationship;
    if (explicit === "vmi_customer" || explicit === "trading_customer" || explicit === "trading_supplier") {
      relationships.add(explicit);
    } else if (role === "internal_supplies") {
      // Internal Supplies is a role, not a party_flow_relationship row.
      relationships.add("internal_supplies");
    } else if (role === "supplier") {
      relationships.add("trading_supplier");
    }
  }
  return relationships;
}

export function validateReceivingOrganization(
  rows: OrganizationRelationshipRow[],
  organizationId: string,
  inventoryModel: InventoryModel,
): { ok: true } | { ok: false; error: string } {
  const organizationRows = rows.filter((row) => row.id === organizationId);
  if (organizationRows.length === 0 || organizationRows.every((row) => !row.isActive)) {
    return { ok: false, error: "organization_inactive_or_not_found" };
  }
  const required = RECEIVING_RELATIONSHIP_BY_MODEL[inventoryModel];
  if (!activeOrganizationRelationships(organizationRows).has(required)) {
    return { ok: false, error: "organization_relationship_required" };
  }
  return { ok: true };
}

export function validateOutboundOrganization(
  rows: OrganizationRelationshipRow[],
  organizationId: string,
  inventoryModel: InventoryModel,
): { ok: true } | { ok: false; error: string } {
  const organizationRows = rows.filter((row) => row.id === organizationId);
  if (organizationRows.length === 0 || organizationRows.every((row) => !row.isActive)) {
    return { ok: false, error: "organization_inactive_or_not_found" };
  }
  const required = OUTBOUND_CUSTOMER_RELATIONSHIP_BY_MODEL[inventoryModel];
  if (!required || !activeOrganizationRelationships(organizationRows).has(required)) {
    return { ok: false, error: "organization_relationship_required" };
  }
  return { ok: true };
}

export function validateVmiEndCustomer(
  rows: OrganizationRelationshipRow[],
  organizationId: string,
): { ok: true } | { ok: false; error: string } {
  const organizationRows = rows.filter((row) => row.id === organizationId);
  if (organizationRows.length === 0 || organizationRows.every((row) => !row.isActive)) {
    return { ok: false, error: "end_customer_inactive_or_not_found" };
  }
  const hasEndCustomerRole = organizationRows.some(
    (row) => row.isActive && row.relationshipIsActive !== false && normalizeOrganizationRole(row.role) === "end_customer",
  );
  return hasEndCustomerRole ? { ok: true } : { ok: false, error: "end_customer_relationship_required" };
}
