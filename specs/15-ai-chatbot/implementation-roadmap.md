# AI Chatbot — Whole-System Implementation Roadmap

Status: Implementation in progress; production calls remain gated by endpoint/privacy review.
Updated: 2026-11-03

## Product shape

Build one authenticated, read-only assistant for the whole WIMS. Users see one conversation surface and one floating chatbot head. The assistant reaches knowledge and live application data through separate, approved paths:

1. **Knowledge RAG** answers how-to, policy, terminology, and training questions from approved documents.
2. **Typed live-data tools** answer current operational questions through the eight approved projections under the signed-in user's current permissions and RLS.

The assistant can combine both paths for a mixed question, with separate citations. It never writes, uploads, approves, allocates, dispatches, edits, or invokes a business command. A user who needs to change something follows an authorized link into the owning WIMS feature.

## Target request architecture

```text
Floating chatbot head → authenticated chat panel
  → server request boundary: session, capabilities, scope, online status, limits
  → intent router: help/document question, live-data question, mixed, unsafe/unsupported
  → authorized retrieval
      ├─ RAG: approved, versioned knowledge chunks filtered by access scope
      └─ live tools: feature-owned typed projections under user-bound RLS
  → minimize fields and label each source as guidance or live data
  → server-only model call with bounded context
  → validate response, claims, citations, quantity labels, and size
  → answer with source links, effective/version or as-of labels, and next step
```

The model receives neither database credentials nor arbitrary SQL capability. The server—not the model—decides which tools are available and validates every tool request. Conversation history is context only; it does not grant access or replace a fresh authorization check.

## Knowledge RAG plan

### Initial corpus

Index only approved, useful-to-answer material: WIMS operating guides and SOPs, approved policy/terminology references, training material, and feature help content. Start with internal-user content. Add party-facing content only after separate publication and visibility rules are approved. Do not put live inventory, party records, billing rows, approvals, inspection evidence, private uploads, or chat histories into the general knowledge index.

Chat itself has no upload control. A separate trusted documentation publishing process owns ingestion, review, replacement, and removal. Source documents are validated and scanned through the owning document/security workflow before indexing.

### Ingestion and index lifecycle

1. Register each source with an owner, canonical ID, version, publication state, effective dates, language, classification, and allowed capability/role/party/flow scopes.
2. Extract text and structural metadata; retain page, heading, and paragraph anchors for citations. Reject unsupported, unpublished, expired, or untrusted sources.
3. Split text along headings and semantic boundaries, with bounded chunk sizes and small overlap. Store source/version/section metadata alongside each chunk.
4. Generate embeddings server-side and index chunks for semantic retrieval. Use lexical matching for exact codes, acronyms, route names, and form labels; combine and rerank results within the allowed corpus.
5. On source replacement, reindex the new version and retire old chunks atomically. On withdrawal or access-scope change, remove or invalidate affected chunks and caches. Preserve an auditable source/version record without retaining duplicate raw content unnecessarily.
6. Apply authorization filters before candidate selection and recheck source access before returning citations. Cache keys include the current user's effective scope and source versions; sensitive cross-user answer caching is disabled.

Retrieved text is always labeled as untrusted evidence. It may support an answer but cannot add instructions, capabilities, tool schemas, or permissions. RAG returns concise passages with document title, section/page, version/effective date, and an authorized link.

## Live data coverage

Keep the eight-tool allowlist in `design.md` as the initial registry. Implement and verify adapters by owner rather than exposing tables to the assistant:

| Area | Initial questions | Access boundary |
| --- | --- | --- |
| Items and Organizations (`06`) | item details, enrolled identifiers, authorized Organization details | existing item/party capabilities and party scope |
| Inventory and receiving (`01`, `07`) | current quantity concepts, eligible lots/locations, receiving state | inventory/receiving capability, current RLS and flow/owner scope |
| Pick lists and dispatch (`08`) | authorized pick-list status and committed lines | pick-list read capability; quantities remain clearly labeled |
| Approvals (`09`) | own/currently visible pending approval summaries | approval queue capability; no decision or mutation tool |
| Documents (`10`) | status and authorized source document links | document capability and source-record scope; no upload/generation |
| Transfers and inspection (`11`) | authorized transfer/inspection status and summaries | respective read/perform capabilities; protected evidence excluded by default |
| VMI/Trading (`12`, `13`) | only approved, field-minimized billing/pricing summaries | exact billing/reporting capability and flow scope; cost/margin never inferred from other data |
| Analytics (`16`) | approved KPI/activity aggregates | `reporting.read`; financial fields require their separate capability |

Each adapter returns a typed, minimal projection plus a server-generated `as_of` value and source identifiers. Each owning feature reviews its tool contract and link. If a feature has no safe read query yet, that area stays unavailable to chat until one is implemented; the model must not fill the gap from guesses or broad database reads.

## Role and permission behavior

Resolve the authenticated user, active role, capabilities, party scopes, and optional flow scope on every message and every tool call. Give the model only schemas for tools permitted in that request. Apply the same rules to retrieval results, citations, conversation history, source previews, and error behavior. Revocation applies on the next request.

Do not encode access as a prompt-only rule. Enforce it in server-side policy and the underlying feature query/RLS. A role label alone is insufficient: require the matching capability and resource/party scope. Never use the service role to broaden a user's read access. For out-of-scope resources, use the same safe not-found/forbidden behavior as the owning feature.

## Floating chatbot head and interaction

- Add one floating assistant launcher to the authenticated shell, available across authorized internal and party surfaces as separately enabled by policy. It opens the same assistant, not a different bot per page.
- Use an accessible button with a clear name, keyboard focus, screen-reader status, and a floor-appropriate touch target. Show a distinct AI disclosure and online/unavailable state.
- Desktop: open a bounded side panel anchored to the launcher. Mobile: open a safe-area-aware bottom sheet or full-height panel with a clear close/back action.
- Keep the launcher and panel clear of primary actions, scanner/camera view, scan loop, numeric keyboard entry, fixed action bars, and system safe areas. Allow page-specific suppression or repositioning on active scan/commit screens; never steal scanner focus.
- Contextual links may prefill a safe question or provide a route/resource hint, but the server resolves and authorizes the actual resource. Do not automatically send a message when opening the panel.
- Include empty, loading, streaming/partial if adopted, provider error, timeout, rate limit, offline, unable-to-verify, refusal, and source citation states. Do not show a stale answer as live.
- Support copy answer, open source through normal authorization, and report answer feedback. History/deletion controls follow the approved retention policy.

## Delivery phases and exit criteria

### Phase 0 — close release gates

- OpenRouter is selected as the gateway with pinned model/provider configuration, mandatory ZDR, data collection denied, no automatic fallback, and prompt logging disabled. Reconcile remaining decisions in `tasks.md`: exact endpoint/model and region, provider contract/retention, conversation retention/deletion, party-user enablement, source freshness, and fallback behavior.
- Confirm the exact existing RBAC capabilities and safe not-found behavior for every adapter. The Product Owner authorized the eight already-listed §10 projections without separate source-owner signatures; any new capability, field, or projection still needs a spec amendment.
- Approve corpus sources, document classifications, who publishes/removes content, and owner review. Keep scope internal-only until party-safe corpus rules are approved.
- Exit: decisions recorded in `revision-log.md`; `15` requirements/design/tasks and all touched owning specs agree; no unresolved privacy/security gate.

### Phase 1 — provider and service foundation

- Add a server-only provider boundary through `04`, environment-isolated configuration, secrets, request correlation, timeouts, rate/concurrency/token limits, cost telemetry, and redacted logs.
- Decide response persistence. Default to no full prompt/answer logging; store only the approved conversation data and sanitized usage metadata.
- Add a single authenticated, online-only chat request boundary. Fail closed on missing session, scope resolution, or policy checks.
- Exit: provider outage/timeout/limit cases return safe UI states; no secret or full prompt leaks into browser or routine telemetry.

### Phase 2 — authorization kernel and tool contracts

- Implement one reusable authorization context resolver and typed tool registry. Derive user/capability/party/flow scope from the server session, not client fields.
- Implement one adapter at a time, beginning with the lowest-risk help/FAQ and selected operational read queries. Require source-owner review and tests for each adapter.
- Add typed citation metadata and normal route links that reauthorize when opened.
- Exit: allow/deny matrices pass for every role, resource scope, and flow; users cannot widen queries by prompt, URL, client-supplied IDs, or conversation history.

### Phase 3 — knowledge ingestion and RAG

- Build the trusted corpus registry, document parser/chunker, embedding/index job, source version lifecycle, access metadata, removal/reindex path, and retrieval evaluation set.
- Add lexical + semantic retrieval and reranking constrained by pre-retrieval authorization. Cite source title, section/page, version/effective date, and link.
- Test exact terms, ambiguous questions, obsolete versions, no-answer cases, prompt-injection passages, and unauthorized corpus documents.
- Exit: every answerable guidance claim has a source; unsupported answers say they cannot verify; retired/restricted docs no longer appear.

### Phase 4 — mixed RAG and live-data answers

- Add intent routing for guidance, live state, mixed questions, and prohibited/unsupported requests. The route selects only server-authorized tools.
- Enforce canonical quantity terms (`qty_remaining`, `qty_committed`, `qty_available`) and as-of time for stock answers. Keep procedure citations distinct from operational-data citations.
- Add feature adapters in the approved owner sequence, expanding only after contracts and access tests pass.
- Exit: mixed-answer evaluations cite both source types correctly, clearly distinguish current records from procedure guidance, and never invent unavailable data.

### Phase 5 — floating head and assistant UI

- Add the shared shell launcher and responsive panel, accessible controls, disclosure, source cards, useful error states, feedback, and approved history controls.
- Verify all navigation surfaces and feature contexts; suppress/reposition on scan-critical screens and confirm scanner focus stays with its owner.
- Exit: accessibility, keyboard, touch, responsive, scan-loop, offline, and error-state checks pass at representative 375/430/768/1280px widths.

### Phase 6 — privacy, safety, and quality evaluation

- Add automated evaluations for factual grounding, citation correctness, refusal/handoff, source freshness, role isolation, quantity accuracy, and prompt injection from user/document content.
- Run real-Postgres/RLS tests for each adapter and corpus access boundary; verify permission revocation between turns and citation opens.
- Test retention/deletion/export, provider redaction, incident support access, rate-limit abuse, cost ceilings, and data-subject requirements.
- Exit: security/privacy, source-owner, design-system, accessibility, and operational reviews are signed; no cross-scope leakage or mutation path is possible.

### Phase 7 — staged release and operations

- Launch first to a small internal role group with synthetic/non-sensitive evaluation questions; review aggregate quality and cost metrics without retaining raw prompts by default.
- Expand role and feature access only after each source-owner checklist passes. Enable party users only after party corpus/tool isolation is separately proven.
- Monitor latency, answerability, citation use, refusals, unsupported-answer rate, provider health, and estimated cost. Provide a kill switch that disables chat without affecting WIMS workflows.
- Exit: operational owner, support/runbook, incident path, rollback switch, and ongoing corpus maintenance are assigned.

## Required verification matrix

- **Authorization:** each role × capability × party scope × flow scope; revoked role; direct resource lookup; guessed IDs; history/citation replay.
- **RAG:** published/unpublished/replaced/expired/removed docs; exact identifier lookup; semantic question; no-answer; conflicting docs; malicious instructions embedded in documents.
- **Live tools:** current, missing, stale, and unauthorized records; maximum rows; malformed parameters; safe errors; correct as-of timestamps.
- **Mixed answers:** procedure plus current state; source attribution per claim; disagreement between policy versions and live facts; clear uncertainty.
- **Read-only:** prove no insert/update/delete, upload, approval, pick generation, dispatch, billing close, or action simulation is reachable through any chat route/tool.
- **Reliability:** provider timeout/quota/outage, malformed response, duplicate retry, rate/concurrency limit, offline state, and disabled feature.
- **UI:** floating launcher does not cover primary controls; panel focus/return, keyboard and screen-reader semantics, small-screen safe areas, scanner-safe operation, reduced motion, and source-link authorization.

## Current implementation readiness

The first rollout is internal staff only, has no conversation persistence, and uses internal manuals through a Supabase pgvector index protected by `ai_assistant.read` and RLS. It also uses the eight typed live-data projections from `design.md` §10 with feature capabilities and user-bound RLS. The runtime keeps all model calls disabled by default: `AI_CHAT_ENABLED` and `AI_CHAT_PRIVACY_REVIEWED` are false until the exact endpoint, provider, processing region, privacy terms, and latency are verified. Focused live-tool tests and real-Postgres migration/RLS verification remain required before production use. This roadmap does not authorize business writes or unapproved data sources.
