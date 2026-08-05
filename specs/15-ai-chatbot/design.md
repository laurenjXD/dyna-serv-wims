# AI Chatbot — Design

Status: Draft

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
