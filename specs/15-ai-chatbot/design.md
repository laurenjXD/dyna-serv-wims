# AI Chatbot — Design

Status: Approved
Updated: 2026-08-05

## 1. Design intent

The assistant is a server-mediated, retrieval-grounded read-only service. The browser submits a question and conversation context; the server resolves the current user and authorization, retrieves a small set of approved projections, calls the approved model provider, validates the response envelope, and returns an answer with source references.

The model is a translator and explainer, not a database client, workflow engine, policy authority, or second audit trail. Source features continue to own authoritative records and commands.

## 2. Dependencies and ownership

Depends on `00-steering` for product, technology, structure, testing, and privacy decisions; `01` for canonical entities; `02` for capabilities, party/flow scope, RLS, and safe denial; `03` for the online-only Tier 2 boundary; `04` for server runtime, provider credentials, rate limiting, jobs, secrets, monitoring, and retention; `05` for shell/mobile/floor integration; and `14` for optional notification links and AI-service operational alerts.

Read-only source adapters are supplied by the owning features: `06` party/item enrollment, `07` receiving, `08` withdrawal, `09` approvals, `10` documents, `11` transfer/inspection, `12` VMI billing, and `13` Trading. Each adapter exposes a narrow typed projection and may not expose a generic table or SQL interface.

## 3. Request flow

```text
authenticated question
  -> server session + current capability/scope resolution
  -> classify intent and allowed read-only tool set
  -> execute scoped projection queries under RLS
  -> minimize/redact fields and attach source/as-of metadata
  -> call approved model provider server-side
  -> validate answer, citations, safety, and size limits
  -> persist approved conversation metadata/history per policy
  -> return answer with safe links and uncertainty labels
```

The model must not select arbitrary SQL or receive a service-role connection. Tool selection is allowlisted by the server based on the current authorization context. A tool returns only the minimum rows and fields needed for the question, with stable source IDs that are reauthorized when opened.

## 4. Logical data model

The provisional model is:

```text
chat_conversations
  id, owner_user_id, title_safe, created_at, last_activity_at,
  retention_expires_at, deleted_at

chat_messages
  id, conversation_id, role, content_or_reference,
  model/provider metadata, created_at, correlation_id

chat_sources
  message_id, source_type, source_id, as_of_at, label_safe

ai_usage_events
  request_id, user/role scope, model, token/latency estimate,
  outcome, cost bucket, redacted error, created_at
```

Exact storage, whether full content is retained, and whether source snapshots are stored must be approved. If content is retained, access must be owner-scoped plus narrowly approved support/audit capability; it must not become a searchable global data lake. Usage telemetry should store aggregates and redacted metadata by default.

## 5. Grounding, safety, and prompt-injection controls

System/developer policy and tool permissions are server-controlled and are not rendered from user content. Retrieved notes, document text, item descriptions, and pasted messages are untrusted evidence. They may be summarized as data but cannot instruct the model to ignore policy, call a new tool, reveal prompts, or broaden scope.

The response contract should require:

```text
answer: safe text
confidence/status: grounded | partial | unable_to_verify
sources: authorized labels/links with as_of timestamps
next_step: owning feature route or human-review guidance
```

The server rejects malformed, overlong, uncited operational answers where a source is required, and claims of mutation completion. A refusal should be brief and should not disclose hidden policy text. High-risk requests—approval, price override, FIFO/allocation, inspection disposition, RBAC, billing, or inventory mutation—return a handoff to the owning feature.

## 6. Authorization and privacy

Every source adapter runs with the current user-bound authorization context and RLS. Conversation context is not authorization context: historic messages and source references are rechecked before reuse. Party-user prompts are limited to their active party and optional flow scopes. Internal users still require the relevant capability; an administrator role is not a blanket service-role bypass.

Separate projection types should distinguish internal operational fields from party-safe fields. Trading buy cost/margin, VMI internal billing details, inspection evidence, credentials, security events, and unrelated-party records are excluded unless an explicit approved capability and projection permit the field.

## 7. Client, offline, and shell behavior

The chat surface is office-first and responsive. The shell may expose a help/assistant entry point, while feature pages may provide contextual links. It should not interrupt active floor scanning or claim that a live answer is current when offline. `03`’s status model is displayed read-only; chat requests are never placed into the offline queue.

A conversation may be locally draftable if approved, but unsent text must be clearly local and must not be treated as a server response. On reconnect, a new request redoes authentication, authorization, retrieval, and freshness checks. No locally cached answer mints authority.

## 8. Provider and infrastructure behavior

Provider credentials remain server-only and are loaded from environment-specific secret storage. `04` supplies rate limiting, correlation IDs, Sentry redaction, timeout/retry policy, and cost/error telemetry. Model calls should not be retried blindly when a request may have been accepted; request IDs and provider idempotency behavior must be defined.

The initial request path should be synchronous with bounded timeout. Long summaries or approved batch assistance may use a durable job, but the job records the original actor and system executor, is auditable, and cannot execute business mutations. `14` may notify an authorized operator of repeated provider/job failures, but notification delivery is not part of answer correctness.

## 9. Testing strategy

- Vitest: intent/tool allowlists, scope mapping, field minimization/redaction, prompt-injection handling, response validation, citations, refusal/handoff, token/size limits, and retry classification.
- Real Postgres: chat/history RLS, source-adapter RLS, party/flow isolation, revocation, deletion/retention jobs, and audit/usage access.
- Provider integration: environment isolation, timeout/quota/malformed response handling, redacted telemetry, approved retention settings, and cost instrumentation.
- Playwright: authenticated chat, grounded source links, role/party isolation, unsafe requests, provider outage, offline state, history deletion, accessibility, responsive behavior, and preservation of scanner focus.
- Manual QA: representative warehouse questions, uncertainty wording, prompt-injection samples from notes/documents, privacy review, and human-factors review for floor use.

## 10. Tool registry

The approved read-only tool set for v1. The server implements each tool as a typed server-side function. The LLM receives only the typed schema and structured return value; it cannot call arbitrary SQL or access tables outside this registry. All tools execute inside the user-bound RLS transaction described in §3.

| Tool | Source tables / views | Parameters | Returns |
| --- | --- | --- | --- |
| `get_stock_levels` | `lot_inventory_totals` (view), `lots`, `items`, `parties` | `item_code?`, `party_code?`, `flow_type?`, `location_code?` | `qty_remaining`, `qty_committed`, `qty_available`, lot count — grouped by item/party/flow/location |
| `get_lot_detail` | `lots`, `lot_location_balances`, `locations` | `lot_number` | lot `status`, `expiry_date`, per-location breakdown of `qty_remaining` and `qty_committed` |
| `get_item_info` | `items` | `item_code` | `name`, `barcode`, `uom`, `volume_cbm`, `is_perishable`, `min_reorder_level` |
| `get_party_info` | `parties`, `party_roles` | `party_code` | party name, roles, contact fields — scoped to caller's party/flow scope; never returns cross-party data |
| `get_recent_transactions` | `inventory_transactions`, `lots`, `items` | `item_code?`, `party_code?`, `days?`, `limit?` | movement history (movement type, qty, from/to location, timestamp) scoped by RBAC |
| `get_low_stock_items` | `lot_inventory_totals` (view), `items` | `flow_type?` | items where `qty_available < items.min_reorder_level`, scoped by caller's capability |
| `get_pending_items` | `wrr_documents`, `pick_lists`, `wrr_inspection_logs` | `type?` (`wrr` \| `pick_list` \| `inspection`) | pending WRRs (`staged_pending_arrival` / `receiving_in_progress`), open pick lists (`allocated`), and pending inspection records — scoped by capability |
| `get_analytics_summary` | `wrr_documents`, `pick_lists`, `lots`, `lot_inventory_totals` (view), `items`, `wrr_inspection_logs`, `inventory_transactions` | `flow_type?` | The six `16-reporting-and-analytics` FR-1.2 KPI metrics — Total Receipts (MTD), Total Dispatches (MTD), Total Lots In Stock, Total Committed Qty, Low Stock Items Count, Pending Inspections Count — plus the FR-1.4 Activity Heatmap's daily transaction-volume-by-day aggregate (trailing 52 weeks, count only, no per-transaction detail) |

These eight tools are the complete allowed set in v1. Adding or enabling a tool outside this registry requires a spec revision and both sign-offs.

### 10.1 Scope enforcement per tool

Each tool resolves the calling user's authorization context before executing:

- `get_stock_levels`, `get_lot_detail`: require `inventory.read` (global). For VMI party users (`assigned_party` scope), results are filtered to `lots.owner_party_id` matching the user's active `user_party_scopes`. Trading party users have no direct `lots` grant (per `02` §7.4); `get_stock_levels` for Trading party users returns not-found rather than leaking cross-party lot state.
- `get_item_info`: requires `items.read` (global) for internal users. Party users receive only the `party_visible_items` projection defined in `02` §7.4 — `buying_price`, `selling_price`, `min_reorder_level`, and `default_supplier_party_id` are never returned.
- `get_party_info`: requires `parties.read`. Party users receive only the record for their own assigned party. Cross-party lookup returns not-found.
- `get_recent_transactions`: requires `inventory.read` (global). Party users have no grant on `inventory_transactions` (per `02` §7.4) and receive a capability-denied response.
- `get_low_stock_items`: requires `reporting.read` (global) or `inventory.read` (global).
- `get_pending_items`: capability is type-dependent — `receiving.view` for WRRs, `pick_list.read` for pick lists, `inspection.perform` or `inspection.resolve` for inspection records.
- `get_analytics_summary`: requires `reporting.read` (`global`, `supervisor`/`administrator` only per `02-rbac-roles` and `16` §6.1). Floor staff (`warehouse_staff`) never hold `reporting.read` (per `16` FR-2.4/§2) and therefore never receive this tool's schema at all — the model is not offered the tool, not merely refused when asked. Party users are likewise excluded: `16` §6.1 grants party users only `reporting.party_read` (`assigned_party` scope), which this tool does not accept as a substitute, so party sessions do not receive this tool's schema either. The six `16` FR-1.2 KPI metrics and the FR-1.4 heatmap aggregate are counts and quantity sums, not Trading revenue, cost, profit, margin, or price references; none of this tool's returned fields fall under `reporting.financial_read` (`02`; `16` §6.1, line 562), so no field-level financial gating applies to `get_analytics_summary` as currently scoped. If a future revision adds a financial-flavored metric to this tool's return set, that field must additionally require `reporting.financial_read` and must be removed at the projection/RLS boundary for callers who lack it — never returned as null — consistent with `16` §6.1's "Financial absence must remove the columns... not return nulls" discipline; that revision would itself require a spec amendment to this registry, not a silent field addition.

Every tool response includes an `as_of` timestamp representing the query execution time, used as the source citation freshness label.

## 11. Persona, security, audit, rate limits, and offline controls

### 11.1 Persona scope

The server-controlled system prompt establishes the chatbot as a read-only warehouse assistant. The persona cannot be changed by user messages or retrieved content. Explicit constraints embedded in the system prompt:

- The assistant can describe, summarize, and explain warehouse records it retrieves through the approved tool set.
- The assistant cannot take actions, approve requests, dispatch shipments, generate pick lists, alter receiving or inspection results, change prices, or modify RBAC assignments.
- The assistant cannot access pricing, cost, margin, or billing data unless the calling user's capability includes `reporting.read` or `trading.margin_view` (when the latter is defined by `13`).
- The assistant must not claim that an action was completed; it must direct the user to the owning feature for any consequential operation.

### 11.2 Tool allowlist

The 8 tools in §10 are the complete allowed set. The server enforces this contract:

- The model receives schemas only for tools that the current user's authorization scope permits. Unknown or out-of-scope tool calls return a typed refusal without disclosing why the tool is unavailable.
- Tools are server-side functions. The LLM cannot call arbitrary SQL, receive a service-role connection, or access tables outside the registry.
- Tool responses are minimized to the fields required for the question and redacted of internal cost, margin, evidence, and credential data before inclusion in the model context.
- No tool may write to any application table. A tool implementation that performs any INSERT, UPDATE, or DELETE must be rejected in code review as a spec violation.

### 11.3 Prompt-injection handling

User messages and all retrieved content are treated as untrusted input:

- The system prompt instructs the model to ignore instructions embedded in user messages that attempt to change its persona, reveal its system prompt, grant itself new tools, call out-of-registry tools, or take actions outside its read-only role.
- Retrieved fields that may contain user-controlled text — such as `wrr_inspection_logs.remarks`, `items.description`, or `lots.peza_number` — are wrapped as labeled data evidence before inclusion in the model context. They are summarized as data, not executed as instructions.
- Server-side validation: every tool call requested by the model is validated against the current user's RBAC scope before execution, regardless of what the model requests, what the conversation history asserts, or what user messages claim.
- A session that triggers repeated refusals (multiple persona-override attempts, system-prompt extraction, prohibited-data requests) is flagged as `abuse_signal` in `ai_usage_events` and counted against the per-user rate limit.
- A refusal response is brief and does not disclose the content of the system prompt, the full tool list, or the specific policy text that caused the refusal.

### 11.4 Audit

Every chat session is logged with the following minimum metadata in `ai_usage_events` (§4):

| Field | Description |
| --- | --- |
| `session_id` | Stable identifier for the chat session |
| `user_id` | Authenticated user from the current server session |
| `tool_calls` | Array of tool names invoked (not full parameters or response payloads) |
| `outcome` | `answered`, `refused`, `error`, `rate_limited`, `abuse_signal` |
| `created_at` / `last_activity_at` | Server-generated timestamps |
| `correlation_id` | Request trace identifier for provider and Sentry correlation |

Full conversation content (message text, tool parameters, model responses) is NOT stored by default. It may be retained only if a future approved compliance requirement mandates it, defines retention duration, specifies access controls, and records the decision in `specs/00-steering/revision-log.md`. Until then, `ai_usage_events` stores aggregates and redacted metadata only, consistent with §4's approved data model.

### 11.5 Rate limits

- 20 messages per user per hour; 100 messages per user per day.
- Rate limits are enforced server-side using Upstash, consistent with `04-services-and-infrastructure`'s rate-limit infrastructure. Rate-limit state is keyed by authenticated `user_id`, not IP address alone, to prevent shared-IP false positives for floor users on shared devices.
- A rate-limited request returns a distinct UI state (see R6.2 in requirements.md) that identifies the limit type and approximate reset time. It does not alter business data or queue a retry.
- Abuse-signal sessions (§11.3) consume the per-user rate-limit budget in full for the current window, preventing flooding via repeated prompt-injection attempts.
- Operator-level quota overrides are an `04` infrastructure concern, not a chat-layer control.

### 11.6 Offline behavior

The chatbot is disabled when `OfflineStatus.connectivity !== 'online'` as defined by `03-offline-mode-and-client-storage`. There is no local LLM fallback in v1:

- No chat request is placed in the `03` offline queue. Chat is a Tier 2 online-only operation per requirements.md §2.
- When offline, the chat surface shows a distinct unavailable state — not a stale answer and not a loading spinner.
- Cached conversation history (read-only display of past messages) may be shown offline only if explicitly approved, and must be labeled as a local cache that may not reflect current warehouse state.
- On reconnect, a new request performs full authentication, authorization, retrieval, and freshness checks. No locally cached answer or conversation context mints authority for subsequent requests.
