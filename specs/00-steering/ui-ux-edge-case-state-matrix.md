# Dyna-Serv WIMS — UI/UX Edge-Case State Matrix

Status: Canonical acceptance matrix
Owner: Cross-workflow UI/UX and QA
Scope: Enrollment, receiving, inspection, inventory, approvals, pick lists, dispatch, settings, documents, offline mode, and provider failures.

This is the single UI/UX reference for edge-case behavior. Every state must satisfy the shared rule from `ui-ux-design-plan.md §5`: show what happened, why it happened, and the next action. Physical operations remain pessimistic: no success state is shown until the server confirms the command.

## Shared state contract

| State | Required UI | User action | Never do |
|---|---|---|---|
| Loading/checking | Skeleton or progress indicator; preserve context | Wait or cancel where supported | Show empty data as if loaded |
| Empty/no work | Plain-language no-work message and create/refresh action | Create, adjust filters, or refresh | Show fabricated counts or rows |
| Validation | Field-level message plus summary for multiple failures | Correct the named field | Clear valid input |
| Forbidden | “You do not have access” with safe navigation | Return or request access | Reveal protected data existence |
| Not found/stale | Record unavailable or changed; offer reload/back | Reload and reselect | Retry the same stale mutation silently |
| Conflict/concurrency | Explain another action changed the record | Refresh/review/retry | Claim success |
| Offline | Connection badge, queued/blocked reason, retry path | Continue only with approved Tier 1 work | Queue approvals, pricing, allocation, or RBAC |
| Syncing | Progress and pending count | Continue permitted work | Duplicate submissions |
| Quarantined/rejected sync | Visible reason and supervisor/retry path | Resolve conflict or retry | Hide failed observations |
| Provider unavailable | Service unavailable message and retry/support reference | Retry later or continue unaffected work | Substitute zeros or fake success |
| Success | Confirm exact record/action and next step | Continue/print/open next task | Show before server confirmation |

## Workflow matrix

| Workflow/surface | Edge case | Required state and resolution |
|---|---|---|
| Enrollment — organization | Duplicate code/name | Inline duplicate message; preserve values; link to organization search. |
| Enrollment — organization | Missing/inactive role or relationship | Explain required Organization role/relationship; block save. |
| Enrollment — organization | Hybrid roles | Show each role/relationship separately; filter downstream choices by Inventory Model. |
| Enrollment — item | Missing organization/default source | “Organization is required”; no item save. |
| Enrollment — item | Duplicate code/barcode/DSGC number | Identify conflicting field; offer search/reuse; never overwrite silently. |
| Enrollment — item | Inventory Model changes | Reset incompatible dependent fields with confirmation and unsaved-change warning. |
| Enrollment — item | Provisional item code | “Pending PO/DSGC assignment”; block pick-list generation. |
| Enrollment — location | Invalid/duplicate generated location | Row-level preview errors; allow correction/export; commit only valid rows. |
| Enrollment — all | Session expires during save | Preserve safe draft; sign-in-again state; retry only after reauthorization. |
| Receiving — WRR/CIPL | Organization/model mismatch | Filter Organization choices by relationship and model; revalidate on submit. |
| Receiving — upload | Invalid file/row/parse | Show file, row, reason, and correction path; no partial WRR. |
| Receiving — scan | Unknown/wrong/duplicate/over-quantity scan | What/Why/Next Action feedback; retain line; allow rescan. |
| Receiving — scan | Offline/storage unavailable | Show offline/blocked state; queue only approved observation and show its status. |
| Receiving — commit | Under-scanned/unresolved line | Block only that line; show scanned/expected count and next action. |
| Receiving — commit | Invalid location/disposition/expiry | Exact correction message; no lot or ledger write. |
| Receiving — commit | Duplicate click/stale WRR | Already committed/stale state; refresh; never duplicate inventory. |
| Receiving — document | PDF/email failure | Durable “Generation failed — Retry”; inventory result remains visible. |
| Inspection | Empty queue | Honest empty state with last refresh and refresh action. |
| Inspection | Unauthorized/invalid disposition | Disable unavailable actions; explain required capability/state. |
| Inspection | Concurrent disposition | Stale/conflict state; reload; no duplicate movement. |
| Inspection | Evidence upload failure | Keep disposition pending/blocked; show retry and file requirements. |
| Inventory | Query unavailable | “Inventory data unavailable”; retain filters; retry; never show zero stock. |
| Inventory | No results | Filter-aware empty state and clear-filters action. |
| Inventory | Split/held/quarantined/expired lot | Show status and quantity breakdown; block unavailable quantity. |
| Inventory | Organization/model mismatch | Filter and server-validate source Organization; explain unavailable row. |
| Export | Permission/large export/provider failure | Forbidden/preparing/failed/retry state; never mark incomplete file successful. |
| Approval | Self-approval | Hide/disable decision action with explanation. |
| Approval | Expired/already-decided | Read-only status with timestamp and refresh. |
| Approval | Missing reason/invalid scope | Inline validation; preserve modal input; no mutation. |
| Approval | Concurrent decision | Show current decision; no duplicate audit event. |
| Approval | Offline | Explicitly blocked as Tier 2; do not queue. |
| Pick list — generate | No/partial stock | Show available and shortage; offer approved override path; no silent reservation. |
| Pick list — generate | FIFO/FEFO mismatch | Allocation preview and override approval path; customer cannot choose authoritative lot/location. |
| Pick list — generate | Pricing/FX missing | Pricing attention state with required policy/FX action; no reservation. |
| Pick list — generate | Organization/model mismatch | Filter choices and revalidate; corrective Organization/model message. |
| Pick list — pick | Wrong item/lot/location scan | Mismatch feedback, expected identity, rescan; no progress advance. |
| Pick list — pick | Already selected/over quantity | Line-complete/quantity-exceeded state; prevent another assignment. |
| Pick list — pick | Stock changed after reservation | Stale/unavailable conflict; supervisor/reallocation path. |
| Pick list — pick | Offline | Queue only approved scan observation; never claim final pick. |
| Dispatch | Pick stage incomplete | “Complete picking first” with direct action. |
| Dispatch | Incomplete scan evidence | Remaining line/box count and scan action; block dispatch. |
| Dispatch | Expired commitment | Expired state, released reservation, regenerate/retry path. |
| Dispatch | Concurrent/already dispatched | Current final status; prevent duplicate ledger transaction. |
| Dispatch | Document generation failure | Show dispatched outcome plus document retry; do not reverse stock for PDF failure. |
| Settings/RBAC | Unauthorized route/action | Filter navigation/controls; safe forbidden state; server/RLS remains authoritative. |
| Settings/RBAC | Revoked/deactivated user | End session or block command; invalidate queued work safely. |
| Settings/RBAC | Last administrator removal | Confirmation plus blocking invariant message; no mutation. |
| Settings/RBAC | Duplicate/conflicting role/scope | Explain conflict; require replacement confirmation; audit change. |
| Settings/RBAC | Relationship deactivated | Remove new selections; stale submit returns relationship conflict. |
| Documents | Not ready/missing/expired signed URL | Status and retry/regenerate/request-access action; no blank viewer. |
| Documents | Forbidden/not found | Safe protected-resource message; do not reveal cross-Organization existence. |
| Offline storage | IndexedDB unavailable/full | “Offline storage unavailable”; do not pretend queued. |
| Offline replay | Revoked actor/changed authorization | Visible quarantine reason and supervisor resolution; audit rejection. |
| Offline replay | Conflict/transient failure | Keep conflict entry; bounded retry only for transient errors. |
| Dashboard/reports | Partial query/provider failure | Per-widget unavailable state and retry; no zero substitution. |
| Dashboard/reports | No activity/data | Honest empty state with date/filter context. |
| Notifications | Delivery failure | In-app attention/retry; email failure does not fail the workflow. |

## Acceptance rules

1. Every row above uses either a dedicated screen state or a shared component with the What/Why/Next Action contract.
2. Every physical command has pending, success, failure, stale/conflict, and duplicate/idempotent outcomes.
3. Every Organization selector is filtered by Inventory Model and relationship, then revalidated server-side.
4. Every unavailable query is distinguishable from an empty result.
5. Every offline action displays queued, syncing, retryable, quarantined, and rejected outcomes where applicable.
6. Every protected action is tested through UI visibility, direct request denial, and database/RLS denial.
7. QA records route, state, expected copy, recovery action, and evidence for every row before production sign-off.
