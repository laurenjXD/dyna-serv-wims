SYSTEM CONTEXT
Repo: dyna-serv-wims. Read CLAUDE.md first — binding process doc. Hard rule: no 
application code against any spec whose tasks.md isn't Status: Approved. This task 
is documentation-only. Some specs touched below (07, 08, 11, 16) may be Approved — 
reopening an Approved spec to add a cross-cutting concern is an established pattern 
here. Follow that precedent: mark only the documents you actually change as 
Under Revision, leave the rest alone, and re-approve via the standard sign-off 
pattern once review passes clean.

Read first: specs/00-steering/product.md, tech.md, structure.md, 
brand-design-system.md, revision-log.md (full file).

Core goals driving this revision: Traceability, Accuracy, and Accuracy of non-moving inventory.

Persona note: .claude/agents/*.md defines review personas. For each persona named 
below, adopt its stated scope as a checklist and run that pass yourself, read-only 
against the spec files first (list findings before fixing).

GOAL — Revise Inspection Workflows, Inventory Reporting, and Item Code Display:

1. MASTER INVENTORY TRACKING & ANALYTICS (touches 01-core-data-model, 16-reporting-and-analytics, 05-ui-shell-and-navigation)
   - Establish `lot_number` as the absolute basis for inventory aging calculations within the Master Inventory tracking views.
   - Introduce pricing metrics (profit, revenue, etc.) into the Master Inventory tracking views and Analytics/Reporting dashboards where applicable. Ensure strict RLS/RBAC gates via persona `rbac-rls-reviewer`, as floor staff must not see financials.
   - Define a bulk filtering/grouping contract (by category, item code, flow type, etc.) for the Master Inventory surface that supports Excel report exports containing full connected lot history. (Evaluate if this export/grouping approach is optimal or suggest a more efficient data-model alternative).
   - Dynamic Item Code Display: Across Master Inventory and Analytics views, enforce item code display switching based on `flow_type`. If `vmi`, show `supplier_item_code`. If `trading`, show `dsgc_item_number` (Note: strictly use `dsgc_item_number`, reject the synonym "dsgc part number").

2. RECEIVING INSPECTION FLOW (touches 07-incoming-receiving)
   - Explicitly define visual inspection during Receiving.
   - Define two immediate receiving dispositions: `on_hold` and `reject`.
   - If `reject`: require routing to a designated rejects location, followed by a Return to Vendor (RTV) workflow.
   - If `on_hold`: keep items in a holding state awaiting final disposition, with mandatory remarks.

3. AGING INVENTORY INSPECTION (touches 11-transfer-and-inspection)
   - Define a Daily Inspection workflow specifically for aging/long-stored inventory.
   - Explicitly flag this Open Question in the spec for the product owner: "Which page/UI surface should these aging inspection transfers be initiated from?" (Do not invent the answer; flag it).
   - Support split dispositions from an inspection transfer: e.g., out of 10 items transferred, 3 might be rejected (routed to reject rack) and 7 returned to stock (system must suggest a storage location for the return).
   - Traceability mandates: capture mandatory remarks/dropdown reasons, the duration/date-range the items spent in inspection, and exact quantities returned vs. rejected.

4. REMOVE PRE-DISPATCH INSPECTION (touches 08-outgoing-withdrawal-and-two-stage-commitment, 11-transfer-and-inspection)
   - Strip out any remaining logic, routing, or requirements for "inspection before dispatch". Outbound dispatch is now a direct flow post-picking.

RULES
- Docs only, no application code or real migrations.
- Exact glossary terms from structure.md — no synonyms (e.g., `locations` not `racks` unless specifying a location's rack field, `dsgc_item_number` not `dsgc part number`).
- Any open question you can't resolve from steering docs: record as a named blocker in the spec, don't invent a resolution.
- Log every non-trivial decision to specs/00-steering/revision-log.md, dated, matching existing entry style.
- On each spec returning to Approved, update gantt-mapping.md's row and CLAUDE.md's "Current status" line; mirror any CLAUDE.md edit into AGENTS.md.

OUTPUT
Per spec touched: what was open, what changed, which persona passes ran and their findings, final Status. Flag explicitly anything needing a product-owner call.
