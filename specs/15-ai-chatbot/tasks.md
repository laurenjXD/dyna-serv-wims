# AI Chatbot — Implementation Plan

Status: Draft

## Implementation gate

No model provider integration, prompt templates, chat tables, retrieval adapter, chatbot route, or AI UI may be implemented until `requirements.md` and `design.md` are approved, provider/data-retention decisions are recorded in `specs/00-steering/revision-log.md`, and both sign-offs below are complete. The chatbot remains read-only and online-only unless a future approved spec explicitly changes that boundary.

## Dependencies and aligned boundaries

- `02` approves current capability/scope resolution, RLS, safe denial, and AI-specific access controls.
- `03` confirms AI requests are Tier 2 and never enter the offline queue.
- `04` supplies provider secrets, server-only calls, rate limits, timeout/retry policy, jobs, telemetry, redaction, and cost controls.
- `05` supplies the shell entry point and floor-priority responsive behavior.
- `06–13` approve the read-only source projections and routes for their owned data.
- `14` may deliver operational AI-service alerts but does not make chatbot output authoritative.

## 1. Resolve AI, privacy, and product policy

Testing: product/security/privacy/design review; revision-log update.

- [ ] Select the approved model/provider, environment separation, region, retention, training/data-use, and fallback policy.
- [ ] Decide whether full conversations are retained, the retention/deletion/export process, support access, legal hold, and incident handling.
- [ ] Define supported user roles, party-user availability, answer freshness/as-of requirements, and citation format.
- [ ] Define rate limits, quotas, concurrency, cost budgets, alerts, and abuse handling.
- [ ] Define prohibited requests and the human/owning-feature handoff language.
- [ ] Record decisions in `specs/00-steering/revision-log.md`.

## 2. Define the approved retrieval contract

Testing: contract/unit tests; source-feature review.

- [ ] Inventory initial read-only questions by feature: parties/items, receiving, approvals, withdrawal, documents, transfers/inspection, VMI, and Trading.
- [ ] Define a narrow typed adapter/projection for each approved question; prohibit arbitrary SQL, unrestricted table access, and service-role browser calls.
- [ ] Define required capability, party scope, optional `flow_type`, fields, source labels, and as-of semantics for every adapter.
- [ ] Define safe not-found/forbidden behavior and how revoked access affects historical conversations and links.
- [ ] Have each owning feature approve its projection, privacy boundary, and source link.

## 3. Design schema, retention, and audit

Testing: schema review; `db-migration-verifier`; real-Postgres plan.

- [ ] Approve `chat_conversations`, `chat_messages`, `chat_sources`, and `ai_usage_events` or equivalent tables.
- [ ] Decide whether message content, references, or only redacted metadata are persisted.
- [ ] Define conversation ownership, support/audit access, deletion/anonymization, retention expiry, and indexes.
- [ ] Define correlation/request/provider identifiers without storing secrets or raw sensitive provider payloads.
- [ ] Define audit events for chat access, source retrieval, refusals, deletion, support access, and policy/provider changes.

## 4. Implement server authorization and provider boundary

Testing: unit policy tests; real-Postgres RLS integration; provider integration; `rbac-rls-reviewer` review.

- [ ] Add explicit AI read/chat/history capabilities to the canonical RBAC catalog.
- [ ] Implement current session/capability/party/flow resolution on every request.
- [ ] Implement server-only allowlisted tools and scoped source adapters under RLS.
- [ ] Implement field minimization, redaction, source metadata, and separate internal/party-safe projections.
- [ ] Configure provider secrets, environment restrictions, timeout/size limits, rate limiting, correlation IDs, and sanitized Sentry telemetry through `04`.
- [ ] Verify no provider prompt, response, API key, service credential, or unrestricted source data reaches browser code.

## 5. Implement grounding and safety controls

Testing: Vitest adversarial/prompt-injection tests; provider response-contract tests; manual safety review.

- [ ] Implement intent classification and tool allowlists that fail closed for unknown or mutation-oriented intents.
- [ ] Treat notes, documents, item descriptions, pasted text, and retrieved content as untrusted data.
- [ ] Implement response schema validation, source citation requirements, uncertainty labels, refusal, and owning-feature handoff.
- [ ] Reject unsupported claims of approval, movement, pricing, inspection, document creation, or other mutation completion.
- [ ] Bound conversation context and reauthorize/retrieve current data instead of trusting historic model context.
- [ ] Add abuse handling for prompt flooding, oversized inputs, repeated refusals, and sensitive-data extraction attempts.

## 6. Build client and shell surfaces

Testing: Playwright; accessibility/responsive/manual QA.

- [ ] Add the shell assistant entry point and feature-context links without interrupting active floor scanning.
- [ ] Build chat, source links, as-of labels, loading/partial/error/rate-limit/offline states, and AI disclosure.
- [ ] Make source links reauthorize through the owning feature; never execute a mutation from a chat link or suggestion.
- [ ] Support approved history view/deletion and clear local-draft versus server-response state.
- [ ] Integrate `03` connectivity status read-only; do not queue requests or present cached answers as current.
- [ ] Verify keyboard, screen reader, contrast, reduced motion, mobile layout, and scanner-safe focus.

## 7. Cross-feature, resilience, and release verification

- [ ] Test authorized summaries for receiving, approval, withdrawal, pick/document, transfer/inspection, VMI, and Trading data.
- [ ] Prove cross-party, cost/margin, restricted-evidence, RBAC, and stale-history leakage is impossible through text, citations, errors, or logs.
- [ ] Test provider timeout, quota, malformed output, retry ambiguity, outage, and fallback behavior without changing business state.
- [ ] Test Realtime/notification absence does not prevent chat’s explicit read-only operation and does not make chat authoritative.
- [ ] Verify no approval, inventory, receiving, inspection, transfer, pricing, document, billing, or RBAC mutation can be performed through chat.
- [ ] Run Vitest, real-Postgres, provider/integration, and Playwright tests; complete privacy, security, accessibility, and cost reviews.

## Sign-off

- [ ] Provider, privacy, retention, training/data-use, cost, and supported-role decisions are resolved.
- [ ] Retrieval adapters, fields, citations, source links, and feature ownership are approved.
- [ ] RBAC/RLS, prompt-injection, redaction, history, deletion, and audit controls pass review.
- [ ] Offline/Tier 2 and no-mutation boundaries are verified.
- [ ] Tests and manual QA pass for authorized, unauthorized, stale, offline, and provider-failure cases.
- [ ] Product/security/privacy approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
