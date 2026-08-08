// Contact Party email action helpers.
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R1.9, R6.3, R6.8
//   specs/06-party-and-item-enrollment/design.md §5a
//   lib/rbac/guard.ts — PermissionResult type

import type { PermissionResult } from "@/lib/rbac/guard";

export type ContactPartyActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type ContactPartyEmailPayload = {
  partyId: string;
  recipientEmail: string;       // resolved from DB — never client-supplied
  recipientName: string | null; // contact_person from DB — never client-supplied
  templateKey: string;          // identifies the transactional template in 04's pipeline
  resourceType: "party";
  resourceId: string;           // = partyId
  optionalMessage: string | null;
};

/**
 * Checks whether the calling user has the parties.manage capability.
 * Returns { ok: true } only when permissionResult.kind === "authorized".
 * R6.8: Contact Party action requires parties.manage.
 */
export function checkContactPartyPermission(
  permissionResult: PermissionResult,
): ContactPartyActionResult {
  if (permissionResult.kind === "authorized") {
    return { ok: true };
  }
  if (permissionResult.kind === "unauthenticated") {
    return {
      ok: false,
      error:
        "You must be authenticated to perform this action.",
    };
  }
  // kind === "forbidden"
  return {
    ok: false,
    error:
      "You do not have permission to send a Contact Party email. The 'parties.manage' capability is required.",
  };
}

/**
 * Validates that the server-resolved party email address is present and non-empty.
 * Returns { ok: false, error } for null, undefined, or blank strings.
 * R1.9: The Contact Party action must reject parties with no email on record.
 *
 * Does NOT validate format — format is the enrollment schema's responsibility.
 */
export function validatePartyEmailPresence(
  email: string | null | undefined,
): ContactPartyActionResult {
  if (email == null || email.trim() === "") {
    return {
      ok: false,
      error:
        "This party does not have an email address on record. Add an email address to the party before sending a contact notification.",
    };
  }
  return { ok: true };
}

/**
 * Constructs the payload for the 04-services-and-infrastructure Resend pipeline.
 * resourceType is always 'party'. resourceId is always party.id.
 * The recipient email and name are always taken from the server-resolved party row —
 * no client-supplied recipient is accepted (R6.3).
 */
export function buildContactPartyPayload(
  party: { id: string; email: string; contactPerson: string | null },
  optionalMessage?: string | null,
): ContactPartyEmailPayload {
  return {
    partyId: party.id,
    recipientEmail: party.email,
    recipientName: party.contactPerson,
    templateKey: "contact_party_notification_v1",
    resourceType: "party",
    resourceId: party.id,
    optionalMessage: optionalMessage ?? null,
  };
}
