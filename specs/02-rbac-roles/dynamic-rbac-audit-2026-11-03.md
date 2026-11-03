# Dynamic RBAC audit — 2026-11-03

Verdict: **not ready for dynamic per-account role administration sign-off**.
The shared permission evaluator supports arbitrary role keys and additive
permissions. The current administration surface cannot deliver that model
end to end, and the role mutation actions have security defects.

This audit adds tests and records findings. It does not change application
behavior, migrations, deployed roles, account assignments, or credentials.

## Recommendation: roles as reusable permission bundles

Keep roles, but make the ordinary operational roles configurable. Authorize
features by canonical resource/action/scope grants rather than job titles.
Assign one or more bundles to each account. For example:

| Account | Assigned bundles | Effective permissions |
| --- | --- | --- |
| Receiver A | Receiving reader | receiving.view |
| Receiver B | Receiving reader + Picking operator | receiving.view + pick_list.execute |
| Finance reader | Financial reporting reader | reporting.financial_read |
| Organization contact | Scoped document reader | pick_list.read for assigned Organization/Inventory Model only |

These are illustrative permission bundles, not newly seeded system roles.
Receiving, picking, and reporting workflows can require additional capabilities
for their complete operation. A single grant does not imply every step is available.

A permissions-only interface is possible, but the current persistence model has
no direct user-permission grants or explicit denies. It would require an approved
amendment, scope/delegation rules, audit coverage, and tests. A private per-account
custom role can express unique additive access using the existing model. Avoid
starting with unrestricted per-user allow/deny overrides: their precedence adds
complexity and makes access reviews harder. Removing one role does not remove a
permission still granted by another active role.

Keep protected administration/recovery roles and Organization/Inventory Model
scope separate from operational job titles. A scoped Organization account must
never gain warehouse-wide access merely because its role definition was edited.

This recommendation is based on this repository's additive, database-backed
model. General security principles are deny by default, least privilege, checks
on every request, and authorization tests; see the
[OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
OWASP does not mandate this specific role-bundle design.

## Automated evidence

- Existing targeted suites: **264 passed, 21 files** (`lib/rbac`,
  `lib/user-settings`, `components/settings`, `lib/shell`, RBAC schema).
- Added `lib/rbac/__tests__/dynamic-accounts.test.ts`: 68 normal tests.
  Eight account configurations are tested against eight capability/scope
  combinations, plus overlapping multi-role grants, grant replacement,
  account/scope revocation on a fresh request, and concurrent identity isolation.
- Added `app/(authenticated)/settings/team/actions.rbac-audit.test.ts`:
  four normal checks and **seven explicitly expected failing requirements**.
  The normal checks cover denial without grants and stored system-role protection.
  The seven `it.fails` cases reproduce RBAC-01 through RBAC-07 below using the
  actual server actions and real guard/resolver with mocked database I/O.
  They are known defects, NOT passing security requirements. Once fixed, convert
  them to ordinary `it` tests. Vitest reports them separately as expected fail.
- Full-suite/typecheck/lint results are recorded below after execution.

The new request-level tests supply already-filtered authorization records.
They prove guard/resolver behavior; they do not prove SQL expiry/revocation
filtering, persistence, migration correctness, or database RLS enforcement.

## Findings reproduced by action tests

| ID | Severity | Finding | Source |
| --- | --- | --- | --- |
| RBAC-01 | High | `users.activate` authorizes arbitrary custom-role grant replacement. Account activation must not implicitly confer role administration/delegation. Use an explicitly approved administrative contract and canonical access-assignment capabilities. | Team actions, `saveDynamicRole`, line 444 |
| RBAC-02 | High | Selected permissions missing from the active catalog are silently omitted, yet saving returns success. Unsupported modules/actions are likewise not rejected as invalid input. | Team actions, lines 465–471 |
| RBAC-03 | High | Every rebuilt grant is `global`. The payload has no scope field, and existing scope is not loaded. Editing an `assigned_party` role can replace its grants with warehouse-wide access. | Team actions, lines 463–471 |
| RBAC-04 | High (misrepresentation) | `listRoles` initializes each role with nonempty floor-operator defaults. A custom role with zero grants appears to have receiving, inventory, outgoing, and document capabilities. This misrepresents access; it does not itself grant those permissions in the shared evaluator. | Team actions, lines 316–325, 417 |
| RBAC-05 | Medium | On catalog failure, `listRoles` returns successful fabricated process-local roles. System roles also substitute hard-coded capabilities for database grants. The screen cannot serve as an effective-access reference. | Team actions, lines 364–441 |
| RBAC-06 | High | Custom-role deactivation writes no durable audit event. | Team actions, lines 503–520 |
| RBAC-07 | High | Role-save audit is outside the grant transaction and its errors are ignored. Privilege changes can commit without an attributable audit record. | Team actions, lines 451–494 |

Line references refer to `app/(authenticated)/settings/team/actions.ts` at
audit time. No application source edits were made by this audit.

## Additional implementation findings from source review

1. **No existing-user role editor or assignment mutation.** Invitations accept
   exactly one of the four built-in roles (`lib/user-settings/schemas.ts`,
   `inviteUserSchema`). Team actions have no persistent multi-role assignment,
   replacement, or revocation action. `RoleManagementModal.tsx` is intentionally
   read-only, with disabled checkboxes and no create/save controls. Existing UI
   tests explicitly assert this limitation. Database support alone is not a
   usable dynamic-role feature.
2. **Database enforcement is incomplete for role administration.**
   `0008_rls_policies.sql` provides SELECT-only authenticated policies on
   `roles`/`role_permissions`. Team role mutations use `db` directly, not
   `withRlsTransaction`, and there is no controlled custom-role mutation function
   in the migration chain. With authenticated credentials writes are denied;
   privileged credentials bypass that protection. The actual deployment
   connection role was not inspected, so a deployed bypass is not claimed as
   an executed exploit. Actor-aware database enforcement must be established.
3. **Last-administrator protection is absent.** `suspendUser` deactivates the
   requested account without checking remaining administrative access. No
   corresponding database invariant was found. Role deactivation/grant
   replacement must also preserve a recovery-capable administrator under
   concurrent changes. A client-side warning is insufficient.
4. **Directory state is not effective authorization state.** `listTeamMembers`
   filters assignments only by `revoked_at`, omitting validity windows and role
   active status; it labels users with no role rows as `warehouse_staff`.
   Its Organization scopes similarly omit validity windows. These display
   defaults do not change the shared evaluator but can mislead administrators.
5. **Readout loses granularity.** `listRoles` does not load permission active
   state or grant scope. Module checkboxes collapse several distinct canonical
   permissions, omit many capabilities (including financial and administrative
   grants), and label `documents.download` as Edit. They cannot accurately
   explain or edit arbitrary supported permissions.
6. **Some downstream flows still require the literal administrator role.**
   Data migration and several VMI-period actions additionally check
   `activeRoleKeys.includes("administrator")`. An equivalent custom capability
   bundle will not necessarily work there. Review each workflow's approved
   administrative restriction before replacing such checks; do not remove them
   indiscriminately. Shell presentation also recognizes only built-in role keys,
   so custom office roles default to floor presentation.
7. **Session revocation needs separate validation.** Team suspend/revoke flows
   pass a user ID to `auth.admin.signOut` and ignore returned failures. Verify
   the SDK token contract before considering forced session invalidation tested.
   The shared resolver's live inactive-profile check still independently denies
   new protected requests when the profile is loaded correctly.
8. **Specification history is inconsistent.** Main `02` documents contain a
   2026-10-27 arbitrary-custom-role amendment, but the separate
   `arbitrary-custom-rbac-amendment.md` is Draft, task decisions still describe
   immutable system-role assignment only, and custom-role delivery tasks are
   unchecked. Reconcile the approval record and intended delegation/scope
   contract before a broader implementation. This audit does not create or
   backdate sign-offs.

## What source review supports

- `lib/auth/page-resolver.ts` reads active database role/permission grants with
  assignment validity/revocation predicates on its direct-query path. It has a
  separately implemented Supabase fallback that still needs parity tests.
- `lib/rbac/session.ts` memoizes within a resolver instance only; a fresh
  request resolver can observe changed grants without changing a role name or
  requiring a new login.
- `lib/rbac/guard.ts` checks resource/action and scope, not role names. The new
  tests demonstrate that an `administrator` key without grants gives no
  permissions in this guard.
- Database `has_permission` and `can_access_party_resource` helpers encode
  active profiles, active permissions/roles, assignment validity/revocation,
  and Organization/Inventory Model scoping. This is static evidence, not a
  real-Postgres result from this audit.

## Verification limits and required completion work

No disposable `TEST_DATABASE_URL` is configured and Docker's engine pipe is
unavailable. Do not run the existing destructive schema-rebuilding integration
suites against production or infer success from skipped tests. No real-account
role mutation or browser E2E was executed. Existing E2E files do not provide
an authenticated dynamic-role lifecycle matrix.

Before declaring this feature functional:

1. Reconcile the approved canonical permission/scope/delegation contract.
2. Implement actor-aware transactional role/assignment mutations with validation,
   system-role protection, concurrency-safe last-admin protection, and audit
   events in the same transaction. Preserve scopes and validity windows.
3. Replace fabricated readout with exact active canonical grants; surface errors.
4. Build custom-role editing and existing-user multi-role assignment with an
   effective permission summary and grant/revoke confirmation.
5. Turn all seven expected failures into ordinary passing requirements.
6. Apply the full migration chain to disposable Postgres. Test separate
   authenticated identities, role/grant/scope changes and expiry, concurrent
   administration, CRUD/joins/aggregates/exports/storage access, cross-Organization
   denial, Supplies exclusion, audit rollback/append-only behavior, and SQL actor
   propagation under the actual runtime connection mode.
7. Run browser E2E through administrator create/edit/assign/revoke and a second
   signed-in account's allowed and denied navigation, direct URLs and actions.
   Include role replacement on the next request, page refresh, restart/persistence,
   financial access, and custom-only office/Organization presentation.

Do not mark `02`'s implementation or real-Postgres/E2E sign-off complete on the
basis of the unit suite or this source review.

## Final verification results

- `npm.cmd test`: **200 files; 2,263 ordinary tests passed and seven expected
  failing security requirements reproduced (2,270 total)**. A jsdom navigation
  diagnostic was emitted by the existing suite; there were no failed suites or
  unhandled test errors in the final result.
- `npm.cmd run typecheck`: passed.
- `npx.cmd eslint lib/rbac/__tests__/dynamic-accounts.test.ts
  "app/(authenticated)/settings/team/actions.rbac-audit.test.ts"`: passed.
- Real Postgres and authenticated browser E2E: **not executed** for the
  environment/coverage reasons above. No production build was needed for
  test/document-only additions; no application behavior was changed.

### 2026-11-03 implementation update

The original audit findings above describe the pre-implementation state. Following
Lauren's explicit approval, 0071 adds controlled role/assignment/status/cancellation
functions with canonical scope validation and atomic audit. Team uses exact-grant
custom-role and multi-role account editors. The seven expected-failure cases have
been replaced by ordinary regression checks. Invitation provisioning now assigns
roles through the same database-controlled function in its local transaction.
Independent review found no remaining material blocker in these changed paths.
Shell presentation now handles custom office/Organization roles and refreshes
server authorization on navigation. Do not interpret earlier audit verdict/counts
as the results of the implemented revision; final results are recorded in tasks.md.
Hosted migration application and authenticated browser execution are separate from
local implementation verification and are not claimed by this update.
