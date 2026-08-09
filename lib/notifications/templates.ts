//
// Traceability: specs/14-notifications-and-alerts/design.md §5 ("Separate
// internal and party-safe templates prevent Trading cost/margin, VMI
// internal billing data, inspection evidence, or unrelated party
// information from leaking") and §5 more broadly ("safe display text may
// be stored, sensitive source payloads should be fetched on demand").
//
// Cost/margin fields are OMITTED for party_safe audience, never rendered
// as null/blank — matching this project's established financial-
// projection pattern (01 design.md §3 item 4, 16 FR-2.4).

export interface RawTemplateInput {
  itemCode: string;
  itemName: string;
  quantity: number;
  unitCost?: string;
  marginPercent?: string;
  partyName?: string;
}

export interface SafeTemplateOutput {
  body: string;
}

export function projectSafeTemplate(
  raw: RawTemplateInput,
  audience: "internal" | "party_safe",
): SafeTemplateOutput {
  const lines = [`Item ${raw.itemCode} (${raw.itemName}) — quantity ${raw.quantity}.`];

  if (audience === "internal") {
    if (raw.unitCost) lines.push(`Unit cost: ${raw.unitCost}.`);
    if (raw.marginPercent) lines.push(`Margin: ${raw.marginPercent}%.`);
  }

  if (raw.partyName) lines.push(`Party: ${raw.partyName}.`);

  return { body: lines.join(" ") };
}
