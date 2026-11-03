# System feedback review — 2026-11-03

Product Owner direction: apply the error-writing guide to errors, validation, warnings, loading, empty, unavailable, offline, and success statements across the system.

## Coverage

| Area | Review and changes |
|---|---|
| Shared feedback | Alert, EmptyState, Input, Select, Textarea, table feedback, analytics banners, shell states, scanner discrepancy dialog, camera errors, and export failures |
| Receiving and warehouse operations | WRR creation/editing, CIPL import/download, receiving scan/commit, transfer creation/execution/inspection, inspection disposition, pick-list creation/editing, dispatch/offline verification, Outgoing and Logistics |
| Inventory | Item lookup/detail, opening-stock and DRA imports, pick-list validation/recovery links, stock counts, and dashboard unavailable states |
| Commercial and reporting | Trading/VMI setup, contracts, rate cards, permits, charges, period close/issue/correction, payment/email/document actions, reporting data and previews, document copy/reprint/download |
| Master data | Organization/item/location enrollment, bulk imports, categories, activation/deactivation, and form field errors |
| Accounts and access | Sign-in/invitations, profile/security, settings, roles, users, audit history, sessions, portal access/notifications, migration review and approval |
| Other visible boundaries | Download/export API feedback and the assistant's error display use safe user-facing text; internal machine protocols and AI answer content are not rewritten |

## Shared implementation

`lib/ui/user-messages.ts` maps known domain codes and field validators, preserves reviewed authored text, deduplicates repeated failures, and uses workflow-specific fallbacks for technical details. Feature-specific messages retain their accurate next steps. `CLAUDE.md` and `AGENTS.md` now require the guide for future message/state work.

## Accuracy fixes

- Failed report/contract queries show unavailable states instead of fabricated zero totals or empty lists.
- Required admin settings/session/audit/team reads distinguish failure from confirmed empty/default data.
- Profile partial saves report what succeeded and what still needs saving.
- Refused session revocation does not claim success.
- Clipboard success waits for the copy operation; export preparation failures are visible.
- WRR edit errors and CIPL request failures provide recovery feedback.
- Blank optional Customer PN values are valid; overlong values are blocked with readable guidance.

## Verification

- Non-integration suite: 219 files, 2,429 tests passed with four workers.
- TypeScript: passed.
- ESLint on changed/new message and state sources: no errors; existing unused-code/accessibility warnings remain.
- A page-module import timed out during a parallel run, then passed alone and in the final full run.
- Two stale sidebar tests were updated from 88px to the already-existing 72px width; sidebar behavior was not changed by this review.
- No database migration, live inventory mutation, or publishing was performed for this work. Database integration and browser journey testing were not part of these checks.

## Remaining constraints

Some legacy server-action redirects can still reset unsaved form drafts. Disconnected report previews or portal label-generation features remain unavailable; their messages now describe that state and the supported next step. The formatter cannot replace reviewing newly authored text against the actual workflow contract.
