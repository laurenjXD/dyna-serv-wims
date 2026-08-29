// @vitest-environment node
//
// RED-step unit test for `app/(authenticated)/actions.ts`'s
// `resolveShellUserDisplay()` — specifically the "active Organization scope"
// field required by requirements.md R2.1 / tasks.md §5, which is the last of
// the three account-control display fields (displayName, email were already
// implemented and covered by ShellChrome.test.tsx).
//
// CITATION NOTE: the acceptance criterion text ("The shell SHALL provide an
// account control with safe display information (display name, email,
// active Organization scope) from the resolved session.") is
// requirements.md R2.1 ("Session and account state"), NOT R5.1 ("Layout and
// page context") as ShellChrome.test.tsx's pre-existing comments/describe
// names label it — that mislabeling predates this RED step and is flagged
// here rather than silently propagated; this file cites the correct R2.1.
//
// Traceability:
//   specs/05-ui-shell-and-navigation/requirements.md R2.1 — "The shell SHALL
//     provide an account control with safe display information (display
//     name, email, active Organization scope) from the resolved session."
//   specs/05-ui-shell-and-navigation/tasks.md §5 — "Implement account
//     controls with safe display (displayName, email, Organization scope)
//     and Sign Out action." (unchecked as of this RED step, 2026-08-16)
//   lib/rbac/session.ts — `PartyScope { partyId: string; flowType: FlowType
//     | null }` — no party NAME on the scope itself, so resolving
//     "Organization scope" text requires a `parties` table lookup by
//     `partyId` (lib/db/schema/parties.ts's `name` column).
//
// LAYER CHOICE (per specs/00-steering/testing.md): this is a Vitest unit
// test, not a `.integration.test.ts` real-Postgres test. The function under
// test performs plain `db.select().from(...).where(...)` lookups (no RLS
// policy, no SQL function, no migration-dependent behavior) — exactly the
// "during development, mocked/unit-level" tier testing.md describes, and
// matches this codebase's existing convention: `vitest.setup.ts` already
// globally mocks `@/lib/db/client` for every non-integration test, and
// `lib/auth/page-resolver.ts` (which performs the structurally identical
// user_profiles/user_roles/party_scopes queries this file's resolver
// delegates to) has never required a real-Postgres test for its own unit
// coverage — RLS/SQL-function integration coverage for the underlying
// `parties`/`user_party_scopes` tables belongs to their owning specs
// (01-core-data-model, 02-rbac-roles), not to this shell display-formatting
// concern.
//
// DESIGN DECISION (this RED step, since requirements.md/design.md do not fix
// an exact resolution algorithm): internal staff with `scopeKind: "global"`
// grants have an EMPTY `partyScopes` array and therefore no single
// organization to display — `organizationScope` resolves to `null` for them,
// not "None"/"Global" text (see task instruction). Organization Portal users
// (`assigned_party` scope) have one or more `partyScopes` entries; for those,
// `organizationScope` resolves to the looked-up party name(s), comma-joined
// when there is more than one scope. This test drives that contract: it
// expects `resolveShellUserDisplay()` to return a fourth field,
// `organizationScope: string | null`, and — implementation detail asserted
// here as the expected query order — to issue a SECOND `db.select()` call
// against the `parties` table (after the existing `userProfiles` lookup)
// only when `partyScopes` is non-empty.

import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server — resolveShellUserDisplay calls
// `supabase.auth.getUser()` to get the session email. Not under test here;
// stubbed to a stable value.
// ---------------------------------------------------------------------------
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { email: "jane@example.com" } },
      })),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/auth/page-resolver — resolveShellUserDisplay delegates to
// createPageResolver().getContext() for the authorization context
// (activeRoleKeys + partyScopes). The resolver's own DB-query behavior is
// covered by lib/auth/page-resolver.ts's own tests / db-migration-verifier
// integration coverage, not here — here it is a pure stub returning a
// per-test-controlled `partyScopes` array.
// ---------------------------------------------------------------------------
const mockGetContext = vi.fn();
vi.mock("@/lib/auth/page-resolver", () => ({
  createPageResolver: vi.fn(async () => ({
    getContext: mockGetContext,
  })),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/db/client — overrides the global vitest.setup.ts stub (which
// always resolves `[]`) with a controllable, call-order-based chain so each
// test can supply distinct results for the `userProfiles` lookup (1st
// `db.select()` call) and the `parties` lookup (2nd `db.select()` call, only
// expected when `partyScopes` is non-empty).
// ---------------------------------------------------------------------------
function makeChain(getResult: () => unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const method of [
    "from",
    "where",
    "orderBy",
    "limit",
    "offset",
    "leftJoin",
    "innerJoin",
    "inArray",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  const resolved = Promise.resolve(getResult());
  chain.then = resolved.then.bind(resolved);
  chain.catch = resolved.catch.bind(resolved);
  chain.finally = resolved.finally.bind(resolved);
  return chain;
}

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  db: {
    select: mockSelect,
  },
}));

import { resolveShellUserDisplay } from "@/app/(authenticated)/actions";

describe("resolveShellUserDisplay Organization scope (requirements.md R2.1, tasks.md §5)", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockGetContext.mockReset();
  });

  it(
    "resolves organizationScope to null when the session has no partyScopes " +
      "(global-scoped internal staff — R2.1, task-owner design decision: omit rather than show 'None'/'Global')",
    async () => {
      mockGetContext.mockResolvedValue({
        kind: "authorized",
        context: {
          userId: "user-1",
          profileStatus: "active",
          activeRoleKeys: ["warehouse_staff"],
          grants: [],
          partyScopes: [],
        },
      });
      // 1st db.select() call: userProfiles lookup.
      mockSelect.mockImplementationOnce(() =>
        makeChain(() => [{ displayName: "Jane Doe" }]),
      );

      const result = await resolveShellUserDisplay();

      // EXPECTED FAILURE (RED): the current implementation's return type has
      // no `organizationScope` field at all — this assertion fails because
      // `result.organizationScope` is `undefined`, not `null`.
      expect(result.organizationScope).toBeNull();
    },
  );

  it(
    "resolves organizationScope to the looked-up party name for a single assigned_party scope (R2.1)",
    async () => {
      mockGetContext.mockResolvedValue({
        kind: "authorized",
        context: {
          userId: "user-2",
          profileStatus: "active",
          activeRoleKeys: ["portal_user"],
          grants: [],
          partyScopes: [{ partyId: "party-1", flowType: "trading" }],
        },
      });
      // 1st db.select() call: userProfiles lookup.
      mockSelect.mockImplementationOnce(() =>
        makeChain(() => [{ displayName: "Portal User" }]),
      );
      // 2nd db.select() call: parties lookup, resolving partyId -> name.
      mockSelect.mockImplementationOnce(() =>
        makeChain(() => [{ id: "party-1", name: "Acme Trading Co." }]),
      );

      const result = await resolveShellUserDisplay();

      // EXPECTED FAILURE (RED): `organizationScope` does not exist on the
      // current return value.
      expect(result.organizationScope).toBe("Acme Trading Co.");
    },
  );

  it(
    "comma-joins party names when the session has more than one partyScopes entry (R2.1)",
    async () => {
      mockGetContext.mockResolvedValue({
        kind: "authorized",
        context: {
          userId: "user-3",
          profileStatus: "active",
          activeRoleKeys: ["portal_user"],
          grants: [],
          partyScopes: [
            { partyId: "party-1", flowType: "trading" },
            { partyId: "party-2", flowType: "vmi" },
          ],
        },
      });
      mockSelect.mockImplementationOnce(() =>
        makeChain(() => [{ displayName: "Portal User" }]),
      );
      mockSelect.mockImplementationOnce(() =>
        makeChain(() => [
          { id: "party-1", name: "Acme Trading Co." },
          { id: "party-2", name: "Beta VMI Holdings" },
        ]),
      );

      const result = await resolveShellUserDisplay();

      // EXPECTED FAILURE (RED): `organizationScope` does not exist on the
      // current return value.
      expect(result.organizationScope).toBe(
        "Acme Trading Co., Beta VMI Holdings",
      );
    },
  );
});
