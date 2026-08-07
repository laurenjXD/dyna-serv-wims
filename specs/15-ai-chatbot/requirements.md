# AI Chatbot — Requirements

Status: Approved
Updated: 2026-08-05

## 1. Purpose and scope

This feature provides an authenticated, conversational assistant for explaining authorized warehouse and 3PL information, guiding users to approved screens, summarizing visible records, and answering operational questions with clear source references.

The assistant is advisory only. It SHALL NOT approve work, allocate or move inventory, alter receiving or inspection results, change Trading prices, create or issue documents, manage RBAC, close billing, or write audit facts. Any consequential action remains in the owning feature and requires its normal server-side authorization and confirmation flow.

The v1 scope is text chat with bounded, read-only retrieval from approved application queries. Voice, autonomous agents, external web search, unrestricted SQL, model training on customer data, marketing use, and background outreach are out of scope.

## 2. Aligned principles and boundaries

- The server and PostgreSQL domain records remain authoritative; model output is never system state.
- The assistant sees only data the current user could retrieve through the same RBAC capabilities, party scope, optional `flow_type` scope, and RLS rules.
- The client SHALL NOT send arbitrary SQL, service credentials, hidden system prompts, or an unverified party/item/resource scope as authority.
- AI requests are Tier 2 online-only operations. They are not placed in the `03` offline queue and are not answered from stale local data as if current.
- `04-services-and-infrastructure` owns provider credentials, server-only model calls, rate limits, jobs, secrets, telemetry, failure handling, and approved data-retention controls.
- `05` owns the shell entry point and responsive surface; floor workflows retain one-primary-action, scanner-safe behavior and their own immediate feedback.
- `14-notifications-and-alerts` may link users to the assistant or surface an assistant-related service failure, but chatbot output is not a notification or workflow completion signal.
- One warehouse is assumed; no `warehouse_id` is introduced.

## 3. Actors and supported use cases

- **Warehouse/floor user** — asks for short, authorized explanations or navigation help without interrupting scan execution.
- **Office operator** — summarizes receiving, transfer, withdrawal, pick-list, or order information they can already access.
- **Approver/reviewer** — asks for a read-only summary of a pending request; approval still occurs in `09`.
- **Trading/VMI/party user** — asks about only their permitted records; internal cost, margin, unrelated party data, and restricted VMI details remain unavailable.
- **Administrator/operations user** — uses approved system/help content and authorized operational summaries; service-role access is never granted through chat.

## 4. Functional requirements

### R1. Authentication and authorization

1. Chat SHALL require an authenticated session and shall resolve current authorization on every request.
2. Retrieval SHALL use approved server-side tools/query functions that enforce capability, resource, party scope, `flow_type`, and RLS.
3. A user SHALL receive the same safe not-found/forbidden behavior as the underlying application when a referenced resource is outside scope.
4. The model SHALL not infer or broaden authority from conversation text, prior messages, role names, or user-supplied IDs.
5. Authorization changes and revocation SHALL take effect for subsequent retrieval requests; cached conversation context SHALL not grant access.

### R2. Grounded answers

1. Answers about operational state SHALL be grounded in retrieved, authorized records or clearly labeled approved help content.
2. The assistant SHALL distinguish current authoritative state, historical information, inference, and uncertainty.
3. Where a response depends on records, it SHALL provide a concise source label/link that opens through normal authorization and identifies the relevant as-of time where useful.
4. If no authorized source supports an answer, the assistant SHALL say that it cannot verify the information instead of inventing a value.
5. The assistant SHALL not expose hidden fields, raw query output, credentials, prompts, provider responses, or another user’s conversation.

### R3. Safe conversational behavior

1. The assistant SHALL recognize and refuse requests to bypass RBAC/RLS, reveal protected data, fabricate approvals, change records through chat, or disclose system secrets.
2. Prompt injection in user-controlled records, document text, item descriptions, notes, or retrieved content SHALL be treated as untrusted data and SHALL not change tool permissions or policy.
3. The assistant SHALL use plain, operationally useful language and identify when a user must continue in the owning feature.
4. It SHALL not claim that an action was completed unless the owning feature returned an authoritative result; in v1, chat does not execute business mutations.
5. Conversation history may improve context but must be bounded, deletable according to policy, and rechecked against current authorization before reuse.

### R4. Data protection and provider handling

1. AI provider calls SHALL be server-side and shall use approved provider configuration, key management, region/retention settings, and environment isolation.
2. The system SHALL minimize prompts to the fields required for the question and redact credentials, tokens, unnecessary personal data, internal cost/margin, and protected evidence.
3. The product SHALL define whether prompts/responses are retained, for how long, who can access them, and whether provider retention/training is disabled or otherwise approved.
4. Logs and traces SHALL contain correlation IDs and sanitized metadata, not full sensitive prompts or responses by default.
5. Export, deletion, legal hold, and incident-response behavior for chat history SHALL be defined before production use.

### R5. Reliability, limits, and cost

1. Requests SHALL have timeouts, bounded context/token limits, rate limits, concurrency limits, and maximum retrieval size.
2. Provider timeout, quota, network, or malformed-output failure SHALL produce a clear retryable UI state and SHALL not alter business data.
3. Model/provider fallback, if approved, SHALL preserve the same authorization, grounding, privacy, and safety contract.
4. Usage, latency, failure, and estimated cost telemetry SHALL be available to authorized operators without exposing message content.
5. Chat SHALL remain usable when Realtime or `14` delivery is unavailable; it does not depend on a notification arriving first.

### R6. User experience and accessibility

1. The assistant SHALL clearly identify itself as AI-generated and provide a way to report an incorrect or unsafe answer.
2. Loading, partial, empty, stale, offline, provider-error, and rate-limited states SHALL be distinct from a valid answer.
3. The surface SHALL support keyboard navigation, screen readers, contrast, reduced motion, responsive layouts, and copy-safe source links.
4. Offline mode SHALL show that chat is unavailable or stale; it SHALL not silently answer live operational questions from cached conversation text.
5. The floor UI SHALL not steal scanner focus or obscure primary scan/commit feedback.

## 5. Acceptance criteria

- A user cannot obtain another party’s records, Trading margin, VMI-restricted data, inspection evidence, or administrative data through chat, prompts, summaries, links, errors, or history.
- Chat cannot execute or simulate approval, receiving, transfer, withdrawal, pricing, pick-list, acknowledgement, RBAC, or billing mutations.
- Answers identify uncertainty and provide authorized source references where operational data is used.
- Prompt injection and requests for secrets or policy bypass are refused without revealing protected system instructions.
- Provider outage, timeout, or quota exhaustion does not change authoritative application state.
- No chat request is queued for offline replay, and stale/offline states are visible.
- Retention, provider handling, redaction, audit, rate limits, and cost controls are approved before launch.

## 6. Quantity accuracy and action prohibition

These requirements close the gap between the chatbot's retrieval model and the three-quantity inventory contract defined in `01-core-data-model`.

1. The chatbot MUST correctly distinguish and clearly label three quantity concepts in every response that mentions stock levels: `qty_remaining` (physical on-hand, the sum of `lot_location_balances.qty_remaining` across all locations for a lot), `qty_committed` (reserved for active pick lists, the sum of `lot_location_balances.qty_committed`), and `qty_available` (= `qty_remaining` − `qty_committed`, available for new allocation, as derived by the `lot_inventory_totals` view). These definitions are canonical and come from `01-core-data-model`; the chatbot MUST NOT use its own arithmetic or derived quantities.
2. The chatbot MUST NOT use ambiguous terms like "stock", "inventory", or "available" without specifying which quantity is meant. Responses referencing stock levels MUST include the labeled quantity type (`qty_remaining`, `qty_committed`, or `qty_available`) alongside any displayed number.
3. The chatbot MUST NOT authorize, initiate, suggest, or simulate a pick-list generation, inventory commitment, dispatch, or approval action. These are consequential write operations owned by `08-outgoing-withdrawal-and-two-stage-commitment` and `09-approval-queue`; the chatbot can describe that a user must go to those features but cannot act on their behalf.
4. A response that reports a quantity MUST identify the as-of timestamp of the retrieved data so the user understands they are seeing a point-in-time snapshot, not necessarily the current warehouse state at the instant of reading.
5. If the retrieved data shows `qty_available = 0` but `qty_remaining > 0`, the chatbot MUST explain that the remaining quantity is fully committed to active pick lists, not that the item is "out of stock".

## 7. Decisions required before approval

- Approved model/provider, regions, retention, training/data-use settings, and fallback policy.
- Initial read-only tools/query functions and fields allowed for each role/party/flow scope. **Amended 2026-08-07**: the tool set is not limited to inventory/operational data. `design.md` §10 adds an 8th tool, `get_analytics_summary`, covering `16-reporting-and-analytics`'s KPI/activity-volume metrics, gated on `reporting.read` (`supervisor`/`administrator` only, per `02-rbac-roles` and `16` §6.1) so floor staff and party users never receive its schema. None of its current fields require `reporting.financial_read`; see `design.md` §10.1 for the field-level rule that applies if a future revision adds a financial metric.
- Chat-history retention, deletion/export, audit, incident response, and support access policy.
- Source citation format and acceptable answer freshness/as-of semantics.
- Usage quotas, rate limits, budget alerts, and whether the assistant is enabled for party users in v1.
