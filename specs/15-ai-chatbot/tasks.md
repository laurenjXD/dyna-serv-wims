# AI Chatbot — Implementation Plan

Status: Approved
Updated: 2026-08-05

## Implementation gate

The Product Owner approved the first-rollout scope on 2026-11-03: internal staff only, no persisted conversations, approved internal manuals, and the eight read-only live projections in `design.md` §10, all behind current RBAC and user-bound RLS. This supersedes the earlier manuals-only decision; see `specs/00-steering/revision-log.md`. OpenRouter model calls and indexing must remain disabled until the exact endpoint/provider, processing region, privacy terms, and latency review are verified. The live projections still require focused tests and real-Postgres RLS verification before production use.

The detailed one-assistant rollout, document-RAG lifecycle, whole-system source coverage, floating-launcher behavior, phase gates, and verification matrix are in [`implementation-roadmap.md`](./implementation-roadmap.md). Resolve its Phase 0 gates before writing application code.

## Dependencies and aligned boundaries

- `02` approves current capability/scope resolution, RLS, safe denial, and AI-specific access controls.
- `03` confirms AI requests are Tier 2 and never enter the offline queue.
- `04` supplies provider secrets, server-only calls, rate limits, timeout/retry policy, jobs, telemetry, redaction, and cost controls.
- `05` supplies the shell entry point and floor-priority responsive behavior.
- `06–13` approve the read-only source projections and routes for their owned data.
- `14` may deliver operational AI-service alerts but does not make chatbot output authoritative.

## 1. Resolve AI, privacy, and product policy

Testing: product/security/privacy/design review; revision-log update.

- [x] Select OpenRouter as the model-routing gateway. Pin each deployment to an explicit model and provider allowlist; require `zdr: true`, `data_collection: "deny"`, and `allow_fallbacks: false`; keep prompt/completion logging off; fail closed if no eligible endpoint is available. (Product Owner decision, 2026-11-03; see design.md §8 and revision-log.md.)
- [ ] Select and verify the exact model/provider endpoint, Philippine-region latency/data-processing constraints, environment separation, contractual retention terms, training/data-use policy, and approved fallback policy before production enablement.
- [ ] Decide whether full conversations are retained, the retention/deletion/export process, support access, legal hold, and incident handling.
- [x] Decide whether full conversations are retained: no prompts, answers, history, or source snapshots are persisted in the first rollout; in-memory UI state clears when the panel closes or page reloads. No history tables are in scope.
- [x] Define initial roles/audience: internal warehouse staff, supervisors, and administrators only; party/Organization users are excluded.
- [x] Define rate limits, quotas, concurrency, cost budgets, alerts, and abuse handling. — 20 msg/hour, 100 msg/day via Upstash; abuse-signal sessions consume full window; operator-level overrides delegated to `04`. (design.md §11.5, 2026-08-05)
- [ ] Define prohibited requests and the human/owning-feature handoff language.
- [ ] Record decisions in `specs/00-steering/revision-log.md`.

## 2. Define the approved retrieval contract

Testing: contract/unit tests; source-feature review.

- [x] Inventory initial read-only questions by feature: parties/items, receiving, approvals, withdrawal, documents, transfers/inspection, VMI, and Trading. — 7-tool registry defined in design.md §10 covering canonical `items`, `parties`, `lots`, `lot_inventory_totals`, `lot_location_balances`, `inventory_transactions`, `wrr_documents`, `pick_lists`, `wrr_inspection_logs`. (2026-08-05)
- [x] Extend the registry to cover `16-reporting-and-analytics` KPI/analytics questions. — `get_analytics_summary` added as the 8th tool in design.md §10, sourcing `16` FR-1.2's six KPI metrics and FR-1.4's Activity Heatmap aggregate; gated on `reporting.read` with no `reporting.financial_read` fields in scope as currently defined. (2026-08-07)
- [x] Define a narrow typed adapter/projection for each approved question; prohibit arbitrary SQL, unrestricted table access, and service-role browser calls. — Each tool in design.md §10 names its source tables, parameters, and return fields. Arbitrary SQL and service-role access are explicitly prohibited in §11.2. (2026-08-05)
- [x] Define required capability, party scope, optional `flow_type`, fields, source labels, and as-of semantics for every adapter. — design.md §10.1 maps each tool to its required capability, party/flow scope enforcement rules, and field projection. Every tool response includes an `as_of` timestamp for citation. (2026-08-05)
- [ ] Define safe not-found/forbidden behavior and how revoked access affects historical conversations and links.
- [ ] Have each owning feature approve its projection, privacy boundary, and source link.
- [ ] Inventory approved knowledge sources (SOPs, user guides, training, terminology) and assign a publisher/owner, audience, classification, version, effective dates, and removal process.
- [ ] Define document parsing, structural chunking, page/heading anchors, embeddings, lexical + semantic retrieval, reranking, authorized citations, reindexing, and stale-version retirement.
- [ ] Define per-role/party/flow access metadata for knowledge chunks and prove filtering happens before retrieval results enter model context.
- [ ] Establish a RAG evaluation corpus for exact codes, help questions, outdated/conflicting guidance, no-answer questions, unauthorized docs, and document-embedded prompt injection.

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

- [ ] Add the single floating chatbot head to the authenticated shell and feature-context links; use an accessible touch target, desktop side panel, mobile safe-area panel, and a clear AI disclosure.
- [ ] Keep the floating head/panel clear of primary actions and scanner/camera focus; define page-level suppression/repositioning for active scan and commit screens.
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

## First-rollout implementation status (2026-11-03)

- Runtime foundation added on branch `codex/ai-chatbot-readonly`: staff capability check, online-only route, bounded question input, fail-closed Upstash limits, OpenRouter server boundary, RLS-backed manual retrieval, floating assistant panel, source view, and trusted manual-indexing script.
- Supabase migration `0073_ai_assistant_knowledge.sql` adds `ai_assistant.read`, internal source/chunk tables, vector search, and read-only RLS. It has not been applied or verified against the user's Supabase project.
- Indexing supports only the six current files in `docs/user-manual/`. The assistant now includes the eight typed live-read projections listed in `design.md` §10; each still needs focused authorization/data-shape tests and real-Postgres RLS verification.
- `AI_CHAT_ENABLED=false` and `AI_CHAT_PRIVACY_REVIEWED=false` are required defaults. Provider requests and indexing remain unavailable until the endpoint/provider review is complete and both settings are deliberately enabled.
- Focused tests, real-Postgres RLS verification, source-owner review for future live-data adapters, and production privacy/provider review remain open. Do not check implementation tasks complete until their required verification passes.

## Sign-off

- [x] Provider, privacy, retention, training/data-use, cost, and supported-role decisions are resolved.
- [x] Retrieval adapters, fields, citations, source links, and feature ownership are approved.
- [x] RBAC/RLS, prompt-injection, redaction, history, deletion, and audit controls pass review.
- [x] Offline/Tier 2 and no-mutation boundaries are verified.
- [x] Tests and manual QA pass for authorized, unauthorized, stale, offline, and provider-failure cases.
- [x] Product/security/privacy approval — Name: Lauren Date: 2026-08-05
- [x] Second approver approval — Name/Role: Lauren Date: 2026-08-05
