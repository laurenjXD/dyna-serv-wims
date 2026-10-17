# Remaining Supply-Chain, Enrollment, Billing, and UI To-Do Implementation Plan

**Date:** 2026-10-14  
**Branch:** `ml4`  
**Status:** Proposed implementation plan; documentation-only.

## Objective

Complete and verify the outstanding requirements from the supply-chain terminology, enrollment, billing/LOA, document-template, and UI/UX checklist. Work is complete only when the data model, server actions, UI, authorization boundaries, automated tests, and authenticated browser flows agree.

## Current baseline

- TypeScript validation passes.
- Production build passes, but the build skips linting.
- 170 unit-test files and 2,072 non-integration tests pass.
- Sidebar scrolling, Material/Data Management labels, export controls, CC email handling, QR-without-logo output, and basic SOA role filtering already exist.
- Remaining gaps include legacy role naming, RBE persistence/limit enforcement, durable print-template persistence, billing frequency, per-application fee modeling, and complete role-based billing restrictions.

## Required implementation order

### Phase 1 — Confirm and freeze business decisions

Before writing code, record these decisions in the relevant approved feature specs and `specs/00-steering/revision-log.md`:

1. Canonical external-party tiers are `supplier`, `customer`, and `end_customer`.
2. Dyna Serv is the trading supplier; supplier purchase invoices bill Dyna Serv directly.
3. End-customers never receive SOAs or billing documents.
4. “Internal Supplies” is the user-facing and persisted business concept.
5. “Material” is the canonical enrollment label for the current `items` entity.
6. PEZA, LOA, and Bond are grouped under “Compliance Fee” in the fee-management UI.
7. Confirm whether the navigation label is permanently “Data Management”.
8. Define billing-frequency semantics for `weekly`, `monthly`, `daily`, `per_ar`, and `per_transaction`.
9. Define what “per application” means: application number, applicant party, active dates, fee type, amount, and source document.

Do not implement ambiguous fee or role behavior until these decisions are recorded.

### Phase 2 — Normalize party roles and enforce role-aware enrollment

**Primary files:**

- `lib/db/schema/enums.ts`
- `lib/enrollment/party-roles.ts`
- `lib/db/queries/parties.ts`
- `lib/actions/parties.ts`
- `app/(authenticated)/master-data/parties/_components/party-form.tsx`
- `app/(authenticated)/master-data/parties/_components/party-detail-actions.tsx`
- `components/tables/OrganizationsEnrollmentTable.tsx`

Implementation:

1. Decide whether legacy `vendor` is migrated to `supplier` or retained only as a compatibility alias. Do not leave two user-facing supplier concepts.
2. Introduce the canonical persisted value for Internal Supplies, with a forward migration for existing `internal_warehouse` rows.
3. Backfill existing role rows and update all role-prefix, filter, display, receiving, and billing queries.
4. Add a database uniqueness constraint on `(party_id, role)` after cleaning duplicates.
5. Make role submission atomic with party creation/update; selected roles must not silently fail.
6. Require at least one valid business role where the business flow requires it.
7. Make role-dependent sections explicit:
   - Customer: RBE classification and customer-only billing metadata.
   - Supplier: supplier purchasing/billing metadata.
   - End-Customer: no billing fields or billing actions.
   - Internal Supplies: internal-use fields only.
8. Ensure organization lists, detail pages, receiving selectors, trading pricing, SOA selectors, and reports use one canonical role vocabulary.

### Phase 3 — Add a real RBE model and enforce the three-choice limit

Use a dedicated `party_rbe_classifications` table rather than encoding RBE values in `parties.notes`.

Suggested fields:

- `id`
- `party_id`
- `classification`: `EE`, `ELSE`, or `ETC`
- timestamps
- audit fields as required by the approved data model

Rules:

1. RBE rows may exist only for parties with the `customer` role.
2. A party may have no more than three RBE rows.
3. Duplicate classifications are rejected at database and action layers.
4. Existing `[RBE: ...]` note prefixes are migrated into rows, then removed from notes.
5. The UI disables unchecked options once three are selected.
6. The server action rejects more than three values.
7. RBE data is never shown or accepted for suppliers or end-customers.

Tests:

- zero, one, three, and four submitted values;
- duplicate-value rejection;
- non-customer rejection;
- migration/backfill;
- browser test for conditional visibility and disabled fourth selection.

### Phase 4 — Complete the Data Management module

1. Use “Data Management” consistently in navigation, headings, breadcrumbs, permission errors, and tests.
2. Keep explicit subtabs for Organizations, Material, and Locations.
3. Gate create buttons on both the server page and destination action.
4. Add server-backed exports so exports include the full dataset, not only the rendered page.
5. Apply role-dependent form fields and validation to organization enrollment.
6. Add tests for tab visibility, export authorization, empty states, pagination, and read/manage capability combinations.

### Phase 5 — Persist and apply the master document template

**Primary files:**

- `components/settings/GeneralSettingsForm.tsx`
- `app/(authenticated)/settings/general/actions.ts`
- `components/print/MasterDocumentHeader.tsx`
- `components/print/MasterDocumentFooter.tsx`
- WRR, Pick List, SOA, acknowledgement receipt, and report print routes

Implementation:

1. Replace the in-memory settings store with a durable organization/system-settings table or approved settings store.
2. Validate company identity, address/contact information, logo reference, tax/PEZA/ISO metadata, alignments, orientation, signatures, disclaimer, and paper-size presets.
3. Store uploaded logos in approved durable storage; do not store arbitrary large base64 strings in settings.
4. Add a shared server-side resolver for the active template. All required print routes must consume it.
5. Support portrait and landscape through print CSS and paper-size presets.
6. Add optimistic-concurrency protection and administrator-only write access.
7. Audit template changes.

Tests:

- schema and permission tests;
- persistence across a fresh action/page request;
- propagation to WRR, Pick List, SOA, and report outputs;
- print CSS tests for orientation and paper size;
- authenticated browser edit/save/reload/print flow.

### Phase 6 — Complete QR and supplier-section regression coverage

1. Keep QR payloads limited to the required identifier/payload; no logo or decorative image may be embedded inside the QR label.
2. Add component tests proving no logo/image is nested in QR payload areas.
3. Add a party-form test proving new business-role checkboxes start unchecked.
4. Add edit-mode tests proving persisted roles are checked and removed roles are deleted server-side.
5. Add browser checks for QR readability at supported thermal-label dimensions.

### Phase 7 — Implement billing-frequency support

Add a canonical billing-frequency enum and column to the approved billing contract model:

- `weekly`
- `monthly`
- `daily`
- `per_ar`
- `per_transaction`

Implementation:

1. Update Drizzle schema and Supabase migration.
2. Update forms and server actions with validation.
3. Define accrual, period-close, document-generation, and due-date semantics for each frequency.
4. Keep VMI as the only automatic billing pipeline unless another approved contract says otherwise.
5. Reject end-customers as billable parties.
6. Add migration-safe defaults for existing contracts.

Tests:

- schema and enum tests;
- action validation for every frequency;
- weekly/monthly/daily boundary tests;
- AR and transaction-trigger tests;
- end-customer rejection tests;
- regression tests for existing monthly VMI behavior.

### Phase 8 — Model LOA and application-based fees

Introduce an application entity owned by the approved billing/compliance feature. Minimum fields:

- application ID/number;
- party ID;
- application type: LOA, Customs, IN, OUT, Handling & Activity, or approved future type;
- requested/approved dates;
- expiration date;
- active status;
- source document/reference;
- fee lines and currency;
- created/approved/voided audit fields.

Rules:

1. LOA validity is one year from approval unless an approved exception exists.
2. Expiration is always displayed and warns before expiry.
3. Fees accrue only while the application is active.
4. Customs, IN, OUT, and Handling & Activity fees attach to applications, not global recurring flags.
5. Handling fees do not require an LOA.
6. “Others” is a first-class category with a required description.
7. Voided or expired applications contribute no new charges.
8. Issued documents snapshot application, fee, and validity data.

Tests:

- one-year expiration, leap-year, and timezone-boundary tests;
- inactive/expired/voided exclusion tests;
- handling-without-LOA acceptance;
- each application fee type;
- required description for Others;
- historical document snapshot;
- RLS access boundaries.

### Phase 9 — Restrict SOA and billing paths consistently

Create one shared billable-party policy function and use it in:

- SOA directory;
- VMI period creation;
- billing contract creation;
- billing document generation;
- financial report queries;
- billing email delivery;
- API routes.

Policy:

- VMI customer parties may receive VMI billing documents.
- Approved Customer parties may receive customer billing statements where the contract permits.
- Supplier invoices are payable by Dyna Serv and are not supplier SOAs.
- End-customers receive no billing documents.
- Missing or ambiguous roles fail closed for financial actions.

Add unit, integration, and RLS tests. Do not enforce this only in page components.

### Phase 10 — Complete terminology and UI sweep

Search and update user-facing strings, labels, headings, tests, and docs for:

- Internal Warehouse → Internal Supplies;
- Items → Material;
- Enrollment → Data Management where approved;
- PEZA/LOA/Bond grouping → Compliance Fee;
- customer billing statement wording;
- supplier/customer/end-customer terminology.

Do not rename the database table `items` solely for display terminology. Treat any database rename as a separate approved migration.

### Phase 11 — External deliverables and evidence capture

These cannot be validated from source code alone:

1. Send the LOA sample through WhatsApp.
2. Complete the Customer Directory assignment.
3. Complete the Warehouse Map assignment.
4. Complete the Sample WRR assignment.

Attach or link final artifacts in the approved tracking location and record completion in `revision-log.md` or the delivery tracker.

## Test strategy and final gates

### Automated gates

Run from a clean worktree:

```bash
npm run typecheck
npm run lint
npm test -- --exclude '**/*.integration.test.ts'
npm run test:integration
npm run build
```

If integration infrastructure is unavailable, record that explicitly; do not replace it with unit tests and claim full validation.

### Authenticated browser acceptance flows

Using Administrator, Supervisor, Warehouse Staff, and party-user accounts:

1. Create Supplier, Customer, End-Customer, and Internal Supplies records.
2. Confirm roles persist, display in the directory, and survive reload.
3. Confirm Customer-only RBE controls and the three-choice limit.
4. Confirm End-Customer has no billing action or SOA entry.
5. Confirm supplier purchase/billing direction is Dyna Serv-facing.
6. Export all Data Management tabs and verify complete datasets.
7. Edit/save a master template; reload and verify persistence.
8. Render WRR, Pick List, SOA, and report outputs in portrait and landscape.
9. Create each billing frequency and verify period behavior.
10. Create, activate, expire, void, and bill application-based fees.
11. Verify QR labels contain no logo inside or adjacent to the QR payload area.
12. Test the sidebar at short desktop heights and narrow responsive widths.

### Final sign-off criteria

Do not mark the checklist complete until:

- terminology decisions are reflected in persisted data and UI;
- financial restrictions are enforced in actions, queries, APIs, and RLS;
- the RBE limit is enforced server-side;
- template settings persist and are consumed by every required document;
- billing frequency and application-fee behavior have automated coverage;
- unit, integration, lint, typecheck, build, and browser checks are green;
- external deliverables have evidence attached;
- no unresolved P0/P1 defects remain.

## Recommended implementation batches

1. **Batch A:** terminology decisions, role migration, role-aware enrollment, RBE model.
2. **Batch B:** Data Management exports and authorization tests.
3. **Batch C:** durable print-template settings and document propagation.
4. **Batch D:** billing frequency and billable-party policy.
5. **Batch E:** application-based LOA/compliance/fee model.
6. **Batch F:** UI sweep, external evidence, browser QA, and final regression.

Each batch should be implemented against an approved `tasks.md`, use a dedicated migration for schema changes, and end with its own tests before the next batch begins.

