// RED-step unit tests for lib/shell/deep-link.ts (does not exist yet).
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §3.4's "Deep
// link" state row ("Preserve the destination path in a server-validated,
// signed or server-session-stored parameter across the auth redirect; after
// successful sign-in, return to the preserved destination only if it is an
// internal route and the user currently holds the required capability;
// reject external URLs, open-redirect patterns, and routes to which the
// re-authenticated user lacks access... the destination must be
// re-authorized on arrival, not trusted because it was set before sign-in").
//
// Backing acceptance criteria: requirements.md R1.2 ("the user MAY return to
// the originally requested internal route when that route is safe and still
// authorized"), R1.3 ("External URLs and malformed return paths SHALL be
// rejected"), and the AC bullet "A protected deep link redirects safely to
// sign-in when unauthenticated and returns only when the destination remains
// valid and authorized."
//
// This file tests ONLY the pure re-authorization/open-redirect-rejection
// decision (`resolveSafeDeepLinkTarget`). The actual signed/server-session
// storage of the pending destination, and the real "unauthenticated user
// redirected to sign-in and returned" round trip, require a real Auth
// session/browser and are EXPLICITLY DEFERRED to the later E2E pass per this
// task's instructions -- not attempted here with a weak mock.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/shell/deep-link.ts (for frontend-builder):
//
//   export const SAFE_DEEP_LINK_FALLBACK = "/"; // matches R11's general
//   // landing page as the safe default when a requested destination cannot
//   // be honored.
//
//   export function resolveSafeDeepLinkTarget(
//     requestedPath: string,
//     visibleRouteIds: ReadonlySet<string> | readonly string[], // ids from
//       // filterVisibleRoutes(context)'s output -- i.e. the RE-AUTHENTICATED
//       // user's CURRENT authorized route set, never a value cached from
//       // before sign-in.
//   ): string;
//   // Returns `requestedPath` unchanged when it is a same-origin, relative
//   // path (starts with exactly one "/", never "//", never contains "://" or
//   // a "javascript:"/other URL scheme, never a backslash) AND its
//   // registered route id (via lib/shell/active-route's matching, ignoring
//   // query/hash/trailing slash) is present in `visibleRouteIds`.
//   // Returns SAFE_DEEP_LINK_FALLBACK ("/") in every other case: external
//   // URL, malformed path, unregistered path, or a registered-but-currently
//   // -unauthorized path.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

describe("lib/shell/deep-link — resolveSafeDeepLinkTarget (R1.2, R1.3, design.md §3.4)", () => {
  it("returns the requested path unchanged when it is same-origin, registered, and currently authorized", async () => {
    const { resolveSafeDeepLinkTarget } = await import("../deep-link");
    const result = resolveSafeDeepLinkTarget("/receiving", ["receiving"]);
    expect(result).toBe("/receiving");
  });

  it("returns a dynamic-segment path unchanged when its route id is authorized, including a trailing query string", async () => {
    const { resolveSafeDeepLinkTarget } = await import("../deep-link");
    const result = resolveSafeDeepLinkTarget("/receiving/WRR-2026-001?tab=notes", [
      "receiving-detail",
    ]);
    expect(result).toBe("/receiving/WRR-2026-001?tab=notes");
  });

  it("rejects an absolute external URL, falling back to '/'", async () => {
    const { resolveSafeDeepLinkTarget, SAFE_DEEP_LINK_FALLBACK } = await import("../deep-link");
    const result = resolveSafeDeepLinkTarget("https://evil.example.com/receiving", [
      "receiving",
    ]);
    expect(result).toBe(SAFE_DEEP_LINK_FALLBACK);
  });

  it("rejects a protocol-relative open-redirect target ('//evil.example.com'), falling back to '/'", async () => {
    const { resolveSafeDeepLinkTarget, SAFE_DEEP_LINK_FALLBACK } = await import("../deep-link");
    const result = resolveSafeDeepLinkTarget("//evil.example.com", ["receiving"]);
    expect(result).toBe(SAFE_DEEP_LINK_FALLBACK);
  });

  it("rejects a non-http(s) URL scheme ('javascript:alert(1)'), falling back to '/'", async () => {
    const { resolveSafeDeepLinkTarget, SAFE_DEEP_LINK_FALLBACK } = await import("../deep-link");
    const result = resolveSafeDeepLinkTarget("javascript:alert(1)", ["receiving"]);
    expect(result).toBe(SAFE_DEEP_LINK_FALLBACK);
  });

  it("rejects a backslash-based open-redirect trick ('/\\\\evil.example.com'), falling back to '/'", async () => {
    const { resolveSafeDeepLinkTarget, SAFE_DEEP_LINK_FALLBACK } = await import("../deep-link");
    const result = resolveSafeDeepLinkTarget("/\\evil.example.com", ["receiving"]);
    expect(result).toBe(SAFE_DEEP_LINK_FALLBACK);
  });

  it("rejects a path with no leading slash at all, falling back to '/'", async () => {
    const { resolveSafeDeepLinkTarget, SAFE_DEEP_LINK_FALLBACK } = await import("../deep-link");
    const result = resolveSafeDeepLinkTarget("evil.example.com", ["receiving"]);
    expect(result).toBe(SAFE_DEEP_LINK_FALLBACK);
  });

  it("rejects a well-formed, registered path that the RE-AUTHENTICATED user is not currently authorized for, falling back to '/' -- proves re-authorization on arrival, not trust in the pre-sign-in destination", async () => {
    const { resolveSafeDeepLinkTarget, SAFE_DEEP_LINK_FALLBACK } = await import("../deep-link");
    const result = resolveSafeDeepLinkTarget("/approvals", ["receiving"]); // "approvals" id not in the visible set
    expect(result).toBe(SAFE_DEEP_LINK_FALLBACK);
  });

  it("rejects a completely unregistered path, falling back to '/'", async () => {
    const { resolveSafeDeepLinkTarget, SAFE_DEEP_LINK_FALLBACK } = await import("../deep-link");
    const result = resolveSafeDeepLinkTarget("/this-route-does-not-exist", ["receiving"]);
    expect(result).toBe(SAFE_DEEP_LINK_FALLBACK);
  });

  it("rejects an empty string destination, falling back to '/'", async () => {
    const { resolveSafeDeepLinkTarget, SAFE_DEEP_LINK_FALLBACK } = await import("../deep-link");
    const result = resolveSafeDeepLinkTarget("", ["receiving"]);
    expect(result).toBe(SAFE_DEEP_LINK_FALLBACK);
  });

  it("accepts the root path '/' itself when it is in the authorized id set (it always is, being capability 'none')", async () => {
    const { resolveSafeDeepLinkTarget } = await import("../deep-link");
    const result = resolveSafeDeepLinkTarget("/", ["root"]);
    expect(result).toBe("/");
  });
});
