// RED-step unit tests for lib/enrollment/contact-party.ts (does not exist yet).
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md §4 R1.9, R6.3, R6.8
//   specs/06-party-and-item-enrollment/design.md §5a (Contact Party email action)
//   specs/06-party-and-item-enrollment/tasks.md §4b, Testing Matrix §Unit tests
//
// Acceptance criteria covered (requirements.md §5):
//   AC-11 (added 2026-08-07): "An authorized user holding `parties.manage`
//     can trigger a Contact Party email from the party detail view; the send
//     is routed through `04`'s existing Resend operational pipeline and
//     recorded in `email_deliveries` with actor/timestamp/correlation ID; no
//     personal user mailbox or credential is involved at any point; delivery
//     failure does not block or alter party record state."
//   R6.3: "Client-supplied user, role, party scope, or capability values
//     SHALL never establish authorization."
//   R6.8: "The Contact Party email action (R1.9) SHALL require `parties.manage`"
//
// NOTE: tests do NOT call `requirePermission` directly. They test the discrete
// helper functions that the server action delegates to, per testing.md's
// "Unit tests" strategy. The PermissionResult type is imported from the
// existing lib/rbac/guard.ts module (already implemented).
//
// Expected module contract for lib/enrollment/contact-party.ts (for backend-builder):
//
//   import type { PermissionResult } from "@/lib/rbac/guard";
//
//   export type ContactPartyActionResult =
//     | { ok: true }
//     | { ok: false; error: string }
//
//   export type ContactPartyEmailPayload = {
//     partyId: string;
//     recipientEmail: string;       // resolved from DB — never client-supplied
//     recipientName: string | null; // contact_person from DB — never client-supplied
//     templateKey: string;          // identifies the transactional template in 04's pipeline
//     resourceType: "party";
//     resourceId: string;           // = partyId
//     optionalMessage: string | null;
//   }
//
//   export function checkContactPartyPermission(
//     permissionResult: PermissionResult
//   ): ContactPartyActionResult
//   // Returns { ok: false, error: "..." } when permissionResult is not "authorized".
//   // Returns { ok: true } only when permissionResult.kind === "authorized".
//
//   export function validatePartyEmailPresence(
//     email: string | null | undefined
//   ): ContactPartyActionResult
//   // Returns { ok: false, error: "..." } if email is null, undefined, or empty string.
//   // Returns { ok: true } if email is a non-empty string.
//   // Does NOT accept or validate a client-supplied email — only used to
//   // validate a value already resolved server-side from the `parties` row.
//
//   export function buildContactPartyPayload(
//     party: { id: string; email: string; contactPerson: string | null },
//     optionalMessage?: string | null
//   ): ContactPartyEmailPayload
//   // Constructs the payload for the 04-services-and-infrastructure Resend pipeline.
//   // resourceType is ALWAYS "party".
//   // resourceId is ALWAYS party.id — never a client-supplied value.
//   // templateKey identifies the "Contact Party" notification template.

import { describe, expect, it } from "vitest";
import type { PermissionResult } from "@/lib/rbac/guard";
import {
  checkContactPartyPermission,
  validatePartyEmailPresence,
  buildContactPartyPayload,
} from "@/lib/enrollment/contact-party";

// ---------------------------------------------------------------------------
// Helpers: PermissionResult stubs for capability check tests
// ---------------------------------------------------------------------------

const AUTHORIZED_RESULT: PermissionResult = {
  kind: "authorized",
  context: {
    userId: "user-abc-123",
    profileStatus: "active",
    activeRoleKeys: ["administrator"],
    grants: [{ resource: "parties", action: "manage", scopeKind: "global" }],
    partyScopes: [],
  },
};

const UNAUTHENTICATED_RESULT: PermissionResult = { kind: "unauthenticated" };

const FORBIDDEN_MISSING_GRANT: PermissionResult = {
  kind: "forbidden",
  reason: "missing_grant",
};

const FORBIDDEN_INACTIVE: PermissionResult = {
  kind: "forbidden",
  reason: "inactive_profile",
};

// ---------------------------------------------------------------------------
// R6.8 — checkContactPartyPermission: parties.manage capability check
// ---------------------------------------------------------------------------

describe("checkContactPartyPermission — capability check (R6.8, R1.9, design.md §5a)", () => {
  it("returns ok=true when permission result is authorized (parties.manage held)", () => {
    const result = checkContactPartyPermission(AUTHORIZED_RESULT);
    expect(result.ok).toBe(true);
  });

  it("returns ok=false when permission result is unauthenticated (R1.9: gated by parties.manage)", () => {
    const result = checkContactPartyPermission(UNAUTHENTICATED_RESULT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("returns ok=false with descriptive error when missing_grant (caller lacks parties.manage)", () => {
    const result = checkContactPartyPermission(FORBIDDEN_MISSING_GRANT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("returns ok=false when profile is inactive (inactive_profile forbidden)", () => {
    const result = checkContactPartyPermission(FORBIDDEN_INACTIVE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// R1.9 — validatePartyEmailPresence: null/empty email is rejected with actionable error
// ---------------------------------------------------------------------------

describe("validatePartyEmailPresence — email presence validation (R1.9, design.md §5a step 2)", () => {
  it("returns ok=false with descriptive error when email is null (R1.9)", () => {
    const result = validatePartyEmailPresence(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("returns ok=false with descriptive error when email is undefined", () => {
    const result = validatePartyEmailPresence(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("returns ok=false with descriptive error when email is empty string (R1.9)", () => {
    const result = validatePartyEmailPresence("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("returns ok=false with descriptive error when email is whitespace-only string", () => {
    const result = validatePartyEmailPresence("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("returns ok=true when email is a non-empty string (server-resolved value is present)", () => {
    const result = validatePartyEmailPresence("contact@vendor.com");
    expect(result.ok).toBe(true);
  });

  it("does not evaluate the email format — only presence (format is the DB row's value)", () => {
    // This helper's sole job is checking the email is non-null/non-empty.
    // Format validation is the party enrollment schema's responsibility.
    const result = validatePartyEmailPresence("some-value");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R1.9 / R6.3 — buildContactPartyPayload: server-resolved values only
// ---------------------------------------------------------------------------

describe("buildContactPartyPayload — payload construction (R1.9, R6.3, design.md §5a steps 3–4)", () => {
  const PARTY = {
    id: "party-uuid-001",
    email: "contact@vendor.com",
    contactPerson: "Maria Santos",
  };

  it("sets resourceType to 'party' always (design.md §5a step 4)", () => {
    const payload = buildContactPartyPayload(PARTY);
    expect(payload.resourceType).toBe("party");
  });

  it("sets resourceId to party.id — never a client-supplied value (R6.3, design.md §5a)", () => {
    const payload = buildContactPartyPayload(PARTY);
    expect(payload.resourceId).toBe("party-uuid-001");
  });

  it("sets recipientEmail from the server-resolved party.email (R1.9 — client never supplies recipient)", () => {
    const payload = buildContactPartyPayload(PARTY);
    expect(payload.recipientEmail).toBe("contact@vendor.com");
  });

  it("sets recipientName from the server-resolved party.contactPerson (R1.9)", () => {
    const payload = buildContactPartyPayload(PARTY);
    expect(payload.recipientName).toBe("Maria Santos");
  });

  it("sets recipientName to null when contactPerson is null (graceful fallback)", () => {
    const payload = buildContactPartyPayload({ ...PARTY, contactPerson: null });
    expect(payload.recipientName).toBeNull();
  });

  it("includes a non-empty templateKey for the pipeline to route the template (design.md §5a step 4)", () => {
    const payload = buildContactPartyPayload(PARTY);
    expect(typeof payload.templateKey).toBe("string");
    expect(payload.templateKey.length).toBeGreaterThan(0);
  });

  it("sets optionalMessage to null when no message is provided", () => {
    const payload = buildContactPartyPayload(PARTY);
    expect(payload.optionalMessage).toBeNull();
  });

  it("sets optionalMessage to the provided string when a message is supplied", () => {
    const payload = buildContactPartyPayload(PARTY, "Please review the attached shipment details.");
    expect(payload.optionalMessage).toBe("Please review the attached shipment details.");
  });

  it("does NOT expose a client-supplied email field — the payload function has no 'recipientOverride' parameter", () => {
    // Structural proof: buildContactPartyPayload accepts (party, optionalMessage)
    // with no parameter for a client-supplied email override.
    // TypeScript would catch a 3rd argument, but we verify the contract here
    // by confirming the built payload always uses party.email.
    const payloadA = buildContactPartyPayload({ ...PARTY, email: "real@server.com" }, "msg");
    const payloadB = buildContactPartyPayload({ ...PARTY, email: "real@server.com" });
    expect(payloadA.recipientEmail).toBe("real@server.com");
    expect(payloadB.recipientEmail).toBe("real@server.com");
  });

  it("partyId in the payload equals party.id (consistent resource reference)", () => {
    const payload = buildContactPartyPayload(PARTY);
    expect(payload.partyId).toBe(PARTY.id);
  });
});
