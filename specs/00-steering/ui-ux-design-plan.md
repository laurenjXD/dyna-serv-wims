# UI/UX Design Plan — Workflow-Aligned Application Experience

Status: Planning brief (non-implementation)
Updated: 2026-08-11

## 1. Purpose and source hierarchy

This plan turns the supplied **“Dyna-Serv WIMS — Page & Role Map”** workflow artifact (2026-08-10) into a coherent UI/UX design programme. It defines what must be designed, in what order, and how each experience should behave across floor, office, and party contexts. It does **not** authorize application code, introduce tables, alter capabilities, or replace an approved feature specification.

The source hierarchy is binding:

1. Approved feature requirements, designs, and tasks; `01`–`05` provide the foundational contracts.
2. `specs/00-steering/brand-design-system.md` provides all visual and interaction rules.
3. The Page & Role Map provides the operational information architecture and the user-facing intent to validate in designs.

Where the map differs from an approved route, capability, or feature name, preserve the approved contract and record the discrepancy for the owning spec/shell registry. In particular, the UI must never reintroduce a withdrawal-request document/state; outbound begins with direct pick-list generation from Master Inventory.

## 2. Design objective

Make the next physical warehouse action unmistakable for a Warehouse Staff user on a 375–430px handheld scanner, while giving Supervisors, Administrators, and Party Users focused information-dense views that expose only their permitted work.

The experience is organized around four user contexts:

| Context | Primary intent | Design posture |
| --- | --- | --- |
| Warehouse Staff | Receive, pick, dispatch, transfer, inspect | Floor-first, scan-driven, single-column, one next action |
| Supervisor | Perform floor work and resolve exceptions/approvals | Same floor flow when operational; desktop review for decisions and reporting |
| Administrator | Maintain access, parties, items, locations, policies | Office-first forms and tables; no floor-operational shortcuts |
| Party User | Review only their organization’s inventory, orders, documents, and alerts | Separate portal navigation, office composition, visibly scoped to their party |

## 3. Experience principles

- **Scan before tap; tap before type.** Every floor flow opens ready for scanner input and retains a manual fallback without making typing the default.
- **One task, one obvious next action.** An active receiving, pick, dispatch, transfer, or inspection scan loop has one full-width 64px minimum CTA in the bottom third of the viewport. Navigation is hidden while that loop is active.
- **Immediate, unambiguous feedback.** A scan result pairs wording, icon, and a short full-screen success/error signal. Never use color alone for acceptance, hold, or error states.
- **Progress protects physical work.** Show the current line, completed/total count, item/location/lot identity, and the safe recovery path. Do not leave users to infer whether a physical action posted.
- **Progressive disclosure for office density.** Office screens may use search, filters, tabs, data tables, and inline drill-downs. Master Inventory uses expandable item rows rather than a route change for routine investigation.
- **Authorization is an experience constraint, not merely a hidden button.** Navigation is capability-filtered; server authorization remains authoritative. Explain unavailable access without leaking protected records.
- **External context stays external.** Party Portal screens use their own navigation set and clear “your organization” framing. No cross-party switcher or ambiguous shared data treatment is allowed.

## 4. Information architecture and key journeys

Design the shell first, then the following journeys. The route names below are planning labels; the approved shell registry remains canonical.

| Journey | Screens / states to design | Critical UX decision |
| --- | --- | --- |
| Home and work queue | Role-adaptive home; empty, loading, offline-attention states | Home summarizes and routes work; it never becomes a KPI/financial dashboard. |
| Receiving / Incoming | Hub tabs (Receive, WRRs, Incoming Ledger); new WRR; detail; scan/Store/Hold; print/reprint | Location appears only after a successful scan; each Store/Hold commits a line immediately. |
| Inventory to outbound | Master Inventory tabs (Stock View, Pick Lists, Daily Inspection); item row expansion; allocation preview; pick-list generation | Show FEFO/FIFO allocation transparently; only an out-of-sequence selection creates an approval request. |
| Pick and dispatch | Active-pick queue; Pick scan loop; FIFO override request; Dispatch scan loop; completion / AR success | Separate physical pick and dispatch stages; dispatch is the final committed withdrawal and receipt-generation moment. |
| Transfer and inspection | Transfer list, creation/detail, execution, optional inspection, inspection queue/detail | Make custody/status transition explicit; resolution controls appear only to a Supervisor. |
| Approval queue | List, filters, detail, approve/reject confirmation | Surface requester, age, reason, target lot, and self-approval block before decision. |
| Enrollment and account administration | Enrollment tabs (Parties, Items, Locations); detail/edit; profile; settings/team/general/security | Use one consistent master-data form framework; deactivate is explicit, reversible-in-concept, and never presented as deletion. |
| Documents, billing, reports, and sync | Document archive; pricing/billing tabs; report dashboard; sync conflict/review | Clearly distinguish launch-ready work from planned placeholders; never label online/idle as “synced.” |
| Party Portal | Portal home; inventory; orders; documents; notifications; labels | Use party-scoped empty states and document provenance, with no internal operational controls. |

## 5. Screen-pattern library

Design reusable patterns in Figma before page-level polish. Each pattern must have floor and/or office variants only where the context genuinely differs.

1. **App shell:** office sidebar/mobile drawer, floor bottom tabs between flows, scan-flow header, account/status region, safe loading/error/forbidden/empty states.
2. **Work queue:** filterable office table and floor card-list equivalent; status, age, owner, and next-action treatment.
3. **Scan flow:** scan-ready input, large current-item card, expected-versus-scanned counter, location suggestion/override, manual-entry recovery, success/error feedback, and exit confirmation.
4. **Commitment confirmation:** concise review of irreversible effects for Store, Hold, Dispatch, and approval decisions; progress remains visible after confirmation.
5. **Master-data form:** conditional fields by item flow type, inline validation, duplicate feedback, unsaved-change protection, and deactivation confirmation.
6. **Data exploration:** searchable dense table, expandable detail, status/filter chips, mono treatment for codes/quantities, and a mobile readable alternative.
7. **Document and report views:** printable-document controls, watermark/reprint state, report cards/charts, date/filter controls, and financial-data access states.

## 6. Visual and interaction direction

Use the approved design system without exceptions: Inter and JetBrains Mono; solid white surfaces; lavender canvas on office screens; `brand-red` for the primary CTA and never as a status signal; indigo accents for navigation, icons, and charts; 8px spacing rhythm; and no glass/blur effects.

Floor views use 16px minimum text, high-contrast `on-surface` copy, 56px targets by default, 64px floor primary actions, portrait layout, and press feedback rather than hover. Office views use responsive desktop density from `lg` while remaining usable on a phone. Tables are office/review patterns; floor queues are cards. All status states require text plus icon, and all components retain a visible keyboard/scanner focus ring.

## 7. Design sequence and review gates

1. **Align IA:** reconcile the artifact’s page map against the approved route registry, feature ownership, capability catalog, and planned/launch status. Log only genuine cross-spec changes.
2. **Map tasks:** create task flows for receiving, pick/dispatch, transfer/inspection, FIFO override approval, and party portal review. Annotate actor, prerequisite, online requirement, committed state, error recovery, and handoff.
3. **Build foundations:** establish tokens, shell variants, navigation behavior, feedback states, and the reusable pattern library in the design file.
4. **Prototype critical floor flows:** wire Receive → Store/Hold, Pick → override request, and Dispatch → acknowledgement receipt. Test in 375px and 430px portrait frames.
5. **Design office and portal surfaces:** apply the shared patterns to Inventory, Approvals, Enrollment, reporting, and party views, including empty/loading/forbidden states.
6. **Validate:** run task-based usability sessions with a warehouse operator, Supervisor, Administrator, and representative Party User. Test scan success, mismatch, duplicate, over-quantity, offline/Tier-2 block, expired approval, self-approval attempt, and unauthorized deep link.
7. **Handoff:** annotate every approved frame with route/surface, capability, data source owner, component/pattern, responsive behavior, and acceptance criteria. Implementation begins only under its feature’s approved task gate.

## 8. Acceptance measures

- In scan tests, a floor user can identify the next physical action, current item, and committed progress without scrolling or opening a menu.
- A failed scan has a readable reason and recovery action within the same screen; a successful Store/Hold/Dispatch visibly confirms the posted line.
- No role sees a navigation item, control, data field, or financial figure outside its approved capability/scope.
- Every critical journey has designed loading, empty, error, offline/online-required, and completion states before build handoff.
- Design review confirms token, contrast, touch-target, focus, reduced-motion, and responsive rules from the approved design system.

## 9. Open alignment items

Before implementation work, reconcile the artifact’s labels and paths—especially its Outgoing and Enrollment naming—with `05-ui-shell-and-navigation`’s approved navigation registry. Confirm the feature owner for any discrepancy rather than creating alias routes or duplicate sidebar entries. Planned document/reporting/portal areas must remain visibly planned until their owning data contracts are live.
