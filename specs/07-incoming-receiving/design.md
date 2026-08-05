# Incoming Receiving — Design

Status: Draft

## 1. Design intent

Incoming Receiving is a two-surface workflow:

1. An office-oriented pre-receiving surface encodes and prints a WRR from an external CIPL/packing-list reference.
2. A floor-oriented receiving surface reconciles physical carton scans and inbound inspection results, then submits one authoritative receipt commit.

The design preserves the boundary between expectation and inventory: `wrr_documents`/`wrr_items` describe expected inbound goods; active lots and `inventory_transactions` are created only by the authorized commit transaction.

## 2. Foundational dependencies and core tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, `brand-design-system.md`, and `revision-log.md`.
- `01-core-data-model` for the canonical inbound schema and immutable ledger design.
- `02-rbac-roles` for capabilities, party/flow scope, RLS, and current-request authorization.
- `03-offline-mode-and-client-storage` for the limited Tier 1 scan queue and replay rules.
- `04-services-and-infrastructure` for Supabase Auth, private Storage, server transactions, Realtime, email, monitoring, and migration boundaries.
- `05-ui-shell-and-navigation` for authenticated route/layout, floor/office surfaces, page headers, and shared status/error regions.
- `06-party-and-item-enrollment` for online unknown-item resolution.

### Tables touched by this feature

| Table | Use | Boundary |
|---|---|---|
| `parties` | Resolve source party and authorized party/flow context. | Master data owned by `06`; receiving does not edit parties. |
| `items` | Resolve barcode/item identity and read packaging/UOM/volume/perishability data. | Master data owned by `06`; unknown items follow its enrollment path. |
| `locations` | Resolve `receiving_bay`, `inspection`, and putaway recommendations/confirmation. | Location master/physical configuration is owned by the appropriate core/location feature. |
| `lots` | Create/update the approved inbound lot state during receipt commit. | Core/inventory transaction boundary owns invariant enforcement. |
| `wrr_documents` | Store staged WRR header and lifecycle. | Core schema owns fields/status constraints; receiving owns workflow commands. |
| `wrr_items` | Store expected lines and scan reconciliation state. | Core schema owns fields; receiving owns matching behavior. |
| `wrr_inspection_logs` | Store inbound conformance/non-conformance observations. | Use only if retained by approved core schema; transfer inspection remains separate. |
| `inventory_transactions` | Read incoming ledger; insert immutable receiving/putaway movements through server transactions. | No updates/deletes; inventory transaction boundary is authoritative. |

The exact final table columns, including whether scan counters and inspection data live directly on WRR lines or in child records, must be reconciled with the approved `01` migration before implementation. This design does not invent `stock_levels` or another duplicate ledger table.

## 3. Route and shell integration

Provisional App Router surfaces:

```text
app/(authenticated)/
  receiving/
    page.tsx                         # WRR list / receiving work queue
    new/page.tsx                     # office pre-receiving form
    [wrrId]/page.tsx                 # WRR detail/review
    [wrrId]/print/page.tsx           # printable WRR
    [wrrId]/receive/page.tsx         # floor scan/reconciliation flow
    [wrrId]/inspection/page.tsx      # inbound inspection/conformance
  incoming-ledger/page.tsx          # office/review read-only transaction view
```

Route names and capability references remain provisional until `05`, `02`, and the feature route inventory are approved.

- Office routes use the shared office shell and page-header/list/form contracts.
- The floor receive route opts into the floor surface: 16px padding, solid surfaces, scanner-ready input, no dense table, no persistent sidebar during active scanning, and one primary action.
- The print route uses the brand system as the source of truth for generated documents and is not a second editable WRR form.
- Feature content owns scan feedback, remaining-quantity cards, inspection choices, and receipt confirmation. The shell owns global session/navigation/status boundaries.

## 4. State model and command boundaries

```text
Create WRR → staged_pending_arrival
                  │ print/review
                  ▼
          start receiving command
                  ▼
         receiving_in_progress
          ├── scan/reconcile
          ├── inspect/conformance
          └── exception resolution
                  │ all required checks pass
                  ▼
        confirm receipt command
                  ▼
               confirmed
          ├── lots/inbound ledger committed
          └── putaway recommendation/handoff
```

Every mutation is a server action/route-handler command with this sequence:

```text
session → capability/scope → input/schema → current WRR state
       → domain checks → idempotency key → database transaction
       → safe result + revalidation
```

No client command directly updates `lots` or `inventory_transactions`. The confirmation command owns one database transaction that checks all prerequisites, writes the resulting domain records, and records the immutable ledger outcome. If the transaction fails, the WRR remains in a safe prior state.

## 5. Pre-receiving WRR design

The office form captures the approved CIPL/packing-list reference and structured expected lines. The CIPL file is an external reference; it is stored privately and is not assumed to be machine-parsed unless a future approved requirement adds parsing.

Expected line fields include, subject to core approval:

- resolved `item_id` plus CIPL/vendor/customer item references;
- expected quantity and UOM;
- unit/reference CBM and packaging information;
- vendor lot number where known;
- line notes and discrepancy context where permitted.

The form supports draft validation before save, server uniqueness/relationship checks, and an explicit transition to staged status. Editing is allowed while staged; once receiving starts, the scan baseline is immutable or changes through a visible versioned correction flow.

WRR printing is generated from the staged server record and includes a stable WRR number/barcode reference, header references, expected lines, and check-off space. It does not create a receipt outcome.

## 6. Floor scan and reconciliation design

The scan screen is a card/list workflow, not a dense table. It shows one current line/next action, total expected, scanned, remaining, and a clear exception state. Scanner input is treated as keyboard-like input per `testing.md`; the feature may provide a manual recovery input with the same validation path.

The matcher resolves:

```text
scanned barcode → active item identity → current WRR line(s)
                  → expected quantity/UOM/lot context
```

It rejects wrong WRR, wrong item, unknown item, duplicate/over quantity, invalid UOM, and unresolved lot context. A rejected scan does not increment the accepted line count.

If the item is unknown, the screen routes to the online `06` enrollment flow or records an exception. After enrollment, the scan is repeated and revalidated; the original rejected event is not retroactively accepted.

## 7. Inbound inspection design

Inbound inspection is tied to a WRR and expected line, not a generic global inspection record. The result includes conformance/non-conformance, approved reason, remarks/evidence, actor, and timestamp.

- Conformance allows the related line to proceed to receipt commit.
- Non-conformance blocks available inventory posting until an approved resolution.
- Evidence uses private Supabase Storage and inherits WRR/party scope.
- Automated email alerts, if required, are emitted from the committed server/domain event through `04` and do not determine whether inventory was posted.

`11-transfer-and-inspection` may later define transfer-specific inspection state; it must not reuse inbound WRR statuses or silently change receiving commit rules.

## 8. Receipt commit and idempotency

The commit command receives a WRR ID, expected current status, client correlation ID, and idempotency key. It loads authoritative WRR lines/scans, active item/party data, conformance decisions, flow type, required lot metadata, and any approved location/capacity prerequisites.

Within one transaction it:

1. locks or otherwise protects the WRR from concurrent confirmation;
2. verifies all required quantities and decisions;
3. creates the approved lot records/available state for conformant received stock;
4. inserts immutable `inventory_transactions` with `movement_type = 'receiving'`;
5. updates WRR status to `confirmed`;
6. records audit/correlation data according to the approved cross-cutting design.

The idempotency mechanism returns the original authoritative result for a duplicate key. It never treats a client-local “confirmed” state as proof of commit.

## 9. Putaway and incoming ledger

Receiving consumes the approved location/capacity suggestion interface. It may display remaining CBM and candidate `locations`, but it does not create a second capacity calculation or own location enrollment.

The Incoming Ledger is a server-side query/view over `inventory_transactions` filtered by `movement_type` `receiving` and `putaway`, joined through approved relationships for WRR, item, lot, party, user, and location display. It is read-only and scope-filtered. Historical corrections are new domain transactions, never ledger edits.

## 10. Offline, realtime, and infrastructure boundaries

- Only scan/reconciliation capture may be proposed for Tier 1 offline support, and each operation needs an explicit policy from this spec plus `03`.
- WRR creation/edit, CIPL upload, unknown item enrollment, inspection resolution, confirmation, and putaway confirmation are Tier 2/online-only in v1.
- On replay, the server re-authenticates and rechecks WRR status, current capability/scope, item/party state, quantity, and idempotency. Offline data cannot create inventory directly.
- Realtime may invalidate a WRR list/attention state; authoritative refetch is required.
- CIPL/evidence files use private Storage and signed/session-authorized access.
- Sentry/monitoring receives redacted correlation/error data only.

## 11. Design verification before approval

- [ ] Reconcile WRR status, line, inspection, lot, and ledger columns with approved `01-core-data-model`; resolve the raw input-note open questions.
- [ ] Confirm whether `wrr_inspection_logs` is retained as the inbound inspection record and define its final resolution fields.
- [ ] Confirm receipt commit and RLS policy matrix with `02-rbac-roles`.
- [ ] Confirm the exact Tier 1 scan command and rejection behavior with `03-offline-mode-and-client-storage`.
- [ ] Confirm Auth, Storage, email, idempotency, and server transaction boundaries with `04-services-and-infrastructure`.
- [ ] Confirm floor/office routes and feedback contracts with `05-ui-shell-and-navigation`.
- [ ] Confirm unknown item recovery with `06-party-and-item-enrollment`.
- [ ] Have `offline-sync-reviewer`, `rbac-rls-reviewer`, and `design-system-auditor` review before approval.
