// lib/notifications/templates.ts
//
// Traceability: specs/14-notifications-and-alerts/design.md §5 ("Separate
// internal and party-safe templates prevent Trading cost/margin, VMI
// internal billing data, inspection evidence, or unrelated party
// information from leaking") and §5 more broadly ("safe display text may
// be stored, sensitive source payloads should be fetched on demand").
//
// Cost/margin fields and unrelated-party identity are both OMITTED for
// party_safe audience, never rendered as null/blank — matching this
// project's established financial-projection pattern (01 design.md §3
// item 4, 16 FR-2.4).

export interface RawTemplateInput {
  itemCode: string;
  itemName: string;
  quantity: number;
  unitCost?: string;
  marginPercent?: string;
  partyName?: string;
  // The party the source event actually belongs to, if any. Compared
  // against context.recipientPartyId to decide whether partyName is safe
  // to surface for the party_safe audience — design.md §5 names
  // "unrelated party information" as its own leak class, alongside
  // cost/margin, so partyName must not be shown to a party_safe recipient
  // unless it's demonstrably their own party.
  eventPartyId?: string;
}

export interface SafeTemplateOutput {
  title: string;
  body: string;
  templateVersion: string;
}

export function projectSafeTemplate(
  raw: RawTemplateInput,
  audience: "internal" | "party_safe",
  context: { templateVersion: string; recipientPartyId?: string },
): SafeTemplateOutput {
  const title = `${raw.itemCode} — ${raw.itemName}`;
  const lines = [`Item ${raw.itemCode} (${raw.itemName}) — quantity ${raw.quantity}.`];

  if (audience === "internal") {
    if (raw.unitCost) lines.push(`Unit cost: ${raw.unitCost}.`);
    if (raw.marginPercent) lines.push(`Margin: ${raw.marginPercent}%.`);
  }

  // Internal audience always sees partyName (no cross-party isolation
  // concern for staff). party_safe audience only sees it when the event's
  // own party matches the recipient's party — otherwise omitted entirely,
  // never rendered as a blank/placeholder.
  const partyNameSafe =
    audience === "internal" ||
    (raw.eventPartyId !== undefined &&
      context.recipientPartyId !== undefined &&
      raw.eventPartyId === context.recipientPartyId);

  if (raw.partyName && partyNameSafe) lines.push(`Party: ${raw.partyName}.`);

  return { title, body: lines.join(" "), templateVersion: context.templateVersion };
}
