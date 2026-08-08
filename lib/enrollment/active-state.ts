// Active-state helpers for party, item, and location enrollment.
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R1.7, R4.9, R3.7
//   specs/06-party-and-item-enrollment/design.md §5 Edit/deactivate,
//     §6 Item deactivation impact, §6a Edit/deactivate (location impact)

export type ActiveCheckResult =
  | { active: true }
  | { active: false; entityType: string; entityId: string; reason: string };

export function checkPartyIsActive(party: {
  id: string;
  isActive: boolean;
}): ActiveCheckResult {
  if (party.isActive) {
    return { active: true };
  }
  return {
    active: false,
    entityType: "party",
    entityId: party.id,
    reason: `Party ${party.id} is inactive and cannot be used for new operational records.`,
  };
}

export function checkItemIsActive(item: {
  id: string;
  isActive: boolean;
}): ActiveCheckResult {
  if (item.isActive) {
    return { active: true };
  }
  return {
    active: false,
    entityType: "item",
    entityId: item.id,
    reason: `Item ${item.id} is inactive and cannot be used for new WRR lines, lots, or pick-list generation.`,
  };
}

export function checkLocationIsActive(location: {
  id: string;
  isActive: boolean;
}): ActiveCheckResult {
  if (location.isActive) {
    return { active: true };
  }
  return {
    active: false,
    entityType: "location",
    entityId: location.id,
    reason: `Location ${location.id} is inactive and cannot be used for new putaway or placement.`,
  };
}
