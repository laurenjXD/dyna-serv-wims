import { describe, expect, it } from "vitest";
import { resolveRecipients } from "../recipient-resolution";
import type { RecipientCandidate, NotificationSourceEvent } from "../recipient-resolution";

describe("resolveRecipients (design.md §5 authorization intersection)", () => {
  it("includes a candidate whose grant matches the event's required capability and whose party scope matches", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "receiving", action: "view" },
      partyId: "party-1",
      flowType: "vmi",
    };
    const candidates: RecipientCandidate[] = [
      {
        userId: "user-1",
        grants: [{ resource: "receiving", action: "view", scopeKind: "assigned_party" }],
        partyScopes: [{ partyId: "party-1", flowType: "vmi" }],
      },
    ];

    const result = resolveRecipients(candidates, event);

    expect(result).toEqual([{ userId: "user-1" }]);
  });

  it("excludes a candidate with the right capability but the wrong party scope", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "receiving", action: "view" },
      partyId: "party-1",
      flowType: "vmi",
    };
    const candidates: RecipientCandidate[] = [
      {
        userId: "user-2",
        grants: [{ resource: "receiving", action: "view", scopeKind: "assigned_party" }],
        partyScopes: [{ partyId: "party-2", flowType: "vmi" }],
      },
    ];

    expect(resolveRecipients(candidates, event)).toEqual([]);
  });

  it("includes a global-scope grant holder regardless of the event's party/flow, since global scope has no party restriction", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "inspection", action: "resolve" },
      partyId: null,
      flowType: null,
    };
    const candidates: RecipientCandidate[] = [
      {
        userId: "user-3",
        grants: [{ resource: "inspection", action: "resolve", scopeKind: "global" }],
        partyScopes: [],
      },
    ];

    expect(resolveRecipients(candidates, event)).toEqual([{ userId: "user-3" }]);
  });

  it("excludes a candidate who lacks the required capability entirely, even with a matching party scope", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "inspection", action: "resolve" },
      partyId: "party-1",
      flowType: null,
    };
    const candidates: RecipientCandidate[] = [
      {
        userId: "user-4",
        grants: [{ resource: "receiving", action: "view", scopeKind: "global" }],
        partyScopes: [{ partyId: "party-1", flowType: null }],
      },
    ];

    expect(resolveRecipients(candidates, event)).toEqual([]);
  });

  it("deduplicates a candidate appearing twice in the input list", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "receiving", action: "view" },
      partyId: null,
      flowType: null,
    };
    const candidate: RecipientCandidate = {
      userId: "user-5",
      grants: [{ resource: "receiving", action: "view", scopeKind: "global" }],
      partyScopes: [],
    };

    expect(resolveRecipients([candidate, candidate], event)).toEqual([{ userId: "user-5" }]);
  });

  it("excludes a null-flowType party scope from matching a 'supplies' event (02-rbac-roles/design.md: null flowType is not a bare wildcard, never matches supplies)", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "inventory", action: "read" },
      partyId: "party-1",
      flowType: "supplies",
    };
    const candidates: RecipientCandidate[] = [
      {
        userId: "user-6",
        grants: [{ resource: "inventory", action: "read", scopeKind: "assigned_party" }],
        partyScopes: [{ partyId: "party-1", flowType: null }],
      },
    ];

    expect(resolveRecipients(candidates, event)).toEqual([]);
  });

  it("excludes an assigned_party-only grant holder from a global (null-partyId) event, even with the right capability", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "documents", action: "generate" },
      partyId: null,
      flowType: null,
    };
    const candidates: RecipientCandidate[] = [
      {
        userId: "user-7",
        grants: [{ resource: "documents", action: "generate", scopeKind: "assigned_party" }],
        partyScopes: [{ partyId: "party-1", flowType: "vmi" }],
      },
    ];

    expect(resolveRecipients(candidates, event)).toEqual([]);
  });

  it("gate 2: unconditionally excludes an assigned_party scope match on a 'supplies' event even when a scope row explicitly claims flowType 'supplies' (defense-in-depth against a scope row that should never exist per 02 §3.2)", () => {
    const event: NotificationSourceEvent = {
      requiredCapability: { resource: "inventory", action: "read" },
      partyId: "party-1",
      flowType: "supplies",
    };
    const candidates: RecipientCandidate[] = [
      {
        userId: "user-8",
        grants: [{ resource: "inventory", action: "read", scopeKind: "assigned_party" }],
        partyScopes: [{ partyId: "party-1", flowType: "supplies" }],
      },
    ];

    expect(resolveRecipients(candidates, event)).toEqual([]);
  });
});
