Dyna-Serv WIMS — Unified UI/UX & Visual Design System
Status: Unified planning and design reference
Sources combined: UI/UX Design Plan — Workflow-Aligned Application Experience + Brand Identity & Design System — Dyna-Serv
1. Purpose and Source Hierarchy
This document combines the workflow-focused UI/UX plan with the approved visual design system into one reference for designing Dyna-Serv WIMS.
It defines:
What experiences and screens must be designed.
How floor, office, supervisor, administrator, and organization experiences should behave.
The reusable interaction patterns used throughout the application.
The exact visual, responsive, accessibility, and component rules used to present those experiences.
The source hierarchy remains binding:
Approved feature requirements, designs, and tasks provide the foundational product contracts.
This unified UI/UX and visual design system provides the interaction and presentation rules.
The Page & Role Map provides the operational information architecture and user-facing intent.
Terminology Update:
Use the following user-facing UI labels across all screens. (Note: Keep parties and flow_type as the current technical/canonical terms in the codebase until a data-model amendment is approved.)
Organization (replaces Party)
Inventory Model (replaces Flow Type)
Organization Portal (replaces Party Portal)
Inspection (replaces Daily Inspection)
Delivery Receipt / Acknowledgement Receipt (replaces Acknowledgement Receipt until formal document-name decision is approved)
2. Design Objective and Priority
The primary design objective is to make the next physical warehouse action unmistakable for Warehouse Staff using a 375–430px handheld scanner, while giving Supervisors, Administrators, and Organization Users focused, information-dense views that expose only their permitted work.
The warehouseman on a mobile scanner is the primary user the system is optimized for. Floor/mobile constraints are the default for operational screens. Desktop and office experiences use the additional space where appropriate rather than treating mobile as a reduced desktop layout.
Context
Primary Intent
Design Posture
Warehouse Staff
Receive, pick, dispatch, transfer, inspect
Floor-first, scan-driven, single-column, one next action
Supervisor
Perform floor work and resolve exceptions/approvals
Floor flow when operational; desktop review for decisions/reporting
Administrator
Maintain access, organizations, items, locations, policies
Office-first forms and tables; no floor-operational shortcuts

3. Core Experience Principles
3.1 Strictly Pessimistic UI for Physical Commitments
Optimistic UI is explicitly forbidden for floor operations. The system must never show a "success" state for a physical movement (Receive, Pick, Store, Dispatch, Transfer) until the server explicitly confirms it. Physical reality must perfectly match system data.
3.2 Scan before tap; tap before type
Every floor flow opens ready for scanner input. Manual entry remains available as a recovery method but is never the default where scanning or a single tap can complete the action.
3.3 One task, one obvious next action
An active receiving, picking, dispatch, transfer, or inspection loop shows one obvious primary action at a time. The floor primary CTA is full-width, at least 64px high, and positioned in the bottom third of the viewport. Navigation is hidden during active scan loops.
3.4 Immediate and unambiguous feedback
Scan results combine wording, iconography, and a short success/error signal. Status and scan results must never rely on color alone.
3.5 Progress protects physical work
Always show the current line, completed/total count, item/location/lot identity, and safe recovery path. Users should never need to infer whether a physical action was successfully committed.
3.6 Progressive disclosure for office density
Office screens may use search, filters, tabs, data tables, expandable rows, and inline drill-downs. Dense desktop patterns should not be carried into floor workflows.
3.7 Authorization is part of the experience
Navigation is capability-filtered and server authorization remains authoritative. Unavailable access should be explained without exposing protected records.
3.8 External context stays external
Organization Portal screens use their own navigation and clear "your organization" framing. No cross-organization switcher or ambiguous shared-data treatment is permitted.
4. Information Architecture and Key Journeys
4.1 Dashboard
The dashboard remains operational—not a full financial dashboard. Financial figures must remain capability-gated.
Receiving, picking, transfer, and inspection counts.
Quick actions and open work queue.
Recent activity and connectivity attention.
Notifications.
Approval-monitoring badge in the sidebar with a Pending Approval count beside "Approvals".
Weekly transaction line graph (including outgoing quantity, sales, and CBM).
Monthly outgoing KPI summary.
4.2 Receiving
Divided into specific operational tabs:
Work Queue: Open WRRs, status, organization, arrival date, assigned user, next action.
Receive: Mobile/floor-first scan interface to start or resume receiving.
WRRs: Create, search, view, print, and edit staged WRRs. Includes item-barcode generation/reprint.
Incoming Ledger: Confirmed receiving and putaway history.
4.3 Inventory
Stock View: Search by item, organization, inventory model, category, subcategory, lot, location, status, and date. Shows overall quantity/CBM, available/held/under-inspection stock. Includes expandable item → lot → location view, lot history/aging, and Excel export.
Pick Lists: Create directly from available stock. Features FIFO/FEFO allocation preview, selected lots/locations, available quantity, and FIFO override request paths. (Note: Pick Lists remain here, not under Outgoing).
Inspection: Aging inventory candidates showing lot, item, receiving date, location, quantity, reason, owner, status. Includes inspection queue and supervisor-only resolution (return-to-stock or reject).
4.4 Pick and Dispatch
Presented as a focused mobile scan experience for warehouse staff. The workflow remains physically separate (Pick before Dispatch) but is presented as one staged floor experience.
Pick-list header and progress.
Scanner-ready item/location/lot validation (Current instruction vs. picked quantity).
Mismatch feedback, recovery, and FIFO override requests.
Generate/print Pick List.
Final dispatch validation, DR success, print, download, and reprint.
4.5 Outgoing
An office-first page with two tabs:
Outgoing Ledger: Read-only dispatched history. Filters by DR/AR reference, date, organization, inventory model, item, etc. Displays quantity, source location, dispatch date, transaction details.
Logistics: Delivery and PEZA references, uploaded supporting documents, delivery status, manual updates. Includes Add Charges action (charge reason, amount, supporting evidence) and links to DR. 
4.6 Master-Data
Organizations: Organization name/code, organization role, registered country, shipping origin, contacts, addresses, registration/billing details.
Items: The first field is Inventory Model. Form order: Inventory Model → Category (dropdown) → Subcategory (dropdown) → Item identity/code and the other information in the fields of our database.
Locations: Add bulk location generator, naming-convention configuration, preview, duplicate/error report, capacity, occupancy, and rejects-location fields.
4.7 Billing and Pricing
VMI Billing: Add daily VMI accrual featuring contract start/end dates, daily CBM calculation (Beginning, Inbound, Outbound, Ending, Chargeable), and fixed warehousing/delivery/handling charges.
Timeline: Previous day ending CBM → next day beginning CBM → daily accrual → monthly SOA → next-month carry-forward.
SOA (VMI Only): Printable/emailable monthly SOAs per Organization. Page 1: summary/balance. Page 2: daily charge detail. Page 3+: movement history and running CBM.
Trading Pricing: Dyna-Serv Trading is a customer. Pricing rules: Cost of Goods = Buy Cost. Selling Price = Customer Price. Gross Margin = Selling Price − Cost of Goods. Margin % = Gross Margin ÷ Selling Price.
4.8 Reports and Documents
Reports: Excel exports for authorized tables. Weekly transaction/CBM line graphs, monthly KPI trends (receiving, picking, dispatch, stock-aging, FIFO overrides) filterable by core data points.
Documents: Archive for WRRs, Pick Lists, DR/AR, SOAs, Logistics/PEZA documents. Include search, filters, preview, print, download, email, and reprint.
4.9 Organization Portal
Organization Home
Pre-arrival Label Form: Existing item selection, quantity, optional supplier lot number, barcode generation, and submission status.
5. Screen Pattern Library
5. Screen Pattern Library
Reusable patterns should be designed before page-level polish:

App Shell (Floating Bento): The application shell breaks away from edge-to-edge layouts.

Header: An independent horizontal floating pill (radius-full) at the top of the screen respecting outer margins, containing global search, connection status, and profile.

Sidebar (Desktop): An independent vertical panel floating on the left side (radius-xl), not touching the screen edges.

Mobile Tabs (Floor): A floating pill (radius-full) sitting 16px above the bottom of the screen. Must hide entirely during active scan flows.

Work queue: Filterable office table and floor card-list equivalent.

Scan flow: Scan-ready input, current-item card, expected-versus-scanned counter, location override.

Commitment confirmation: Concise review of irreversible effects (Store, Hold, Dispatch).

Master-data form: Conditional fields by inventory model, inline validation, unsaved-change protection.

Data exploration (Mega-Cards): Dense tables are placed inside full-width, hyper-rounded radius-xl (24px) Mega-Cards on desktop. The table scrolls horizontally inside the card to preserve outer rounded corners. Row expansions happen inline (accordion) or via side-drawers (no modals). On mobile, rows transform into vertically stacked radius-lg (16px) individual cards.

Error States & Mismatches (Floor & Office): Error states must never strand the user or rely on generic "An error occurred" text. Every error modal, toast, or feedback screen must explicitly display three components:

What happened: Plain-language title ("Invalid Item Scanned").

Why it failed: Brief context or data mismatch details ("Barcode 12345 does not match the active Pick List").

Next Action / Solution: A direct path to recover ("Rescan the correct item").

6. Color System
Color Role
Color
Hex
Recommended Use
Primary
🔵 Vibrant Blue
#2563EB
Primary buttons, links, active controls
Primary Hover
🔵 Deep Blue
#1E3A8A
Button hover/pressed states
Secondary
🟣 Violet
#7C3AED
Secondary accents, selected elements, highlights
Neutral
◻️ Cool Gray
#94A3B8
Disabled/neutral states, secondary icons
Background
🥛 Cream White
#FFF7ED
Main application background
Surface
⬜ White
#FFFFFF
Cards, tables, modals, sidebar content
Text Primary
🌑 Deep Navy
#0F172A
Headings, important numbers, main text
Text Secondary
🩶 Slate
#64748B
Descriptions, helper text, subtitles
Border
◽ Light Blue-Gray
#E2E8F0
Card, input and table borders
Success
🟢 Emerald
#10B981
Received, available, approved, completed
Warning
🟠 Amber
#F59E0B
Low stock, partial, pending attention
Error
🔴 Red
#EF4444
Failed, rejected, out of stock, destructive actions

Text-color rule: Headings, labels, and body copy use Text Primary (#0F172A) or Text Secondary (#64748B), never Primary or Secondary brand colors. Brand colors are reserved for backgrounds, icons, borders, active-state fills, and chart marks.
7. Typography
Use only two type families to establish hierarchy and clarity.
Family Role
Font
Weights
Usage
Primary Heading
Etna Sans Serif
700, 600
Page titles, large displays, hero numbers
Secondary UI & Body
Glacial Indifference
700, 400
Body copy, navigation, labels, badges, buttons, table headers, data entry

Type Scale
Style
Family / Weight
Size
Line height
headline-xl
Etna Sans Serif / Bold
40px
48px
headline-lg
Etna Sans Serif / Bold
32px
40px
headline-md
Etna Sans Serif / SemiBold
24px
32px
data-display
Etna Sans Serif / SemiBold
20px
24px
body-lg
Glacial Indifference / Regular
18px
28px
body-md
Glacial Indifference / Regular
16px
24px
body-sm
Glacial Indifference / Regular
14px
20px
label
Glacial Indifference / Bold
14px
16px

Floor screens never use text below 16px. body-sm and 14px labels are office-only. Codes and IDs should utilize Glacial Indifference or system standard sans-serif; do not load secondary monospaced fonts to preserve performance.
8. Responsive and Device Strategy
8.1 Mobile-first operational screens
Receiving, Picking, Inspection, and any warehouseman-operated withdrawal step are designed first for approximately 375–430px portrait handheld scanners. Office and supervisor screens may be desktop-first but must remain usable on mobile.
8.2 Breakpoints
Breakpoint
Width
Use
base
0–639px
Default; every floor screen fully functional
sm
640px+
Larger handhelds/small tablets
md
768px+
Tablets; first suitable multi-column point
lg
1024px+
Primary office/supervisor desktop
xl
1280px+
Wide desktop

8.3 Touch targets
Office/desktop: 44×44px minimum.
Floor/mobile default: 56×56px minimum.
Floor primary action: 64×64px minimum; full-width where possible.
8.4 Thumb zone
Place the floor primary action in the bottom third of the viewport, full-width and visible without scrolling. Secondary or destructive actions appear above it and are visually subordinate.
8.5 Orientation
Portrait is the primary supported orientation for floor screens. Do not build floor layouts that depend on landscape orientation.
9. Spacing, Layout, and Shape

Spacing: Base spacing unit is 8px. Floor page padding is 16px. Office page margin is 32px. Office gutter is a wide 24px between floating cards to create the distinct Bento-box separation. Maximum office content width is 1280px.

Shapes:

radius-sm (4px): Small pills/tags, inner table cells

radius-default (8px): Standard inputs

radius-md (12px): Larger form elements and dropdown menus

radius-lg (16px): Mobile floor task cards and sub-panels

radius-xl (24px): The default for all primary dashboard Mega-Cards, modals, and the floating office sidebar to create the soft, modern look.

radius-full (9999px): Primary buttons, active sidebar navigation items, floating top header, and status badges.

Note: The retired diagonal-cut motif must not be reintroduced.
10. Surfaces and ElevationGlassmorphism and backdrop blur are completely retired across the application. Use solid surfaces to create the modular Bento layers.LevelSurfaceShadowUse0Cream White (#FFF7ED)noneBase application background canvas1Solid White (#FFFFFF)0 4px 12px rgba(15, 23, 42, 0.05)Floating Sidebar, Top Header, Mega-Cards, ModalsFloor cards use Level 1 solid White surfaces and avoid translucent effects.
11. Component Guidance

Buttons:

Primary: Vibrant Blue (#2563EB), White text, Glacial Indifference Bold, radius-full (pill-shaped). Minimum 64px height and full-width on floor screens.

Destructive: Red (#EF4444).

Navigation: Office uses a floating Level 1 Solid White sidebar. Active items use a radius-full (pill shape) background in Vibrant Blue at 10% opacity, with Deep Navy (#0F172A) text. Inactive items use Slate (#64748B) text with no background.

Status Badges: radius-full, Glacial Indifference Bold uppercase, semantic colors (Emerald, Amber, Red), and icons on floor screens.

Tables: Office tables use Glacial Indifference Bold uppercase headers and Regular for body copy. They must be housed within radius-xl Level 1 Mega-Cards with overflow-hidden. Floor workflows avoid dense tables entirely and use stacked radius-lg cards.

Forms: Use Glacial Indifference and a visible Vibrant Blue focus ring (radius-md). Minimize floor form fields; prefer scanning and single-tap selection.

Dashboard/KPI Cards: Rendered as modular radius-xl Level 1 Solid White floating cards on desktop. Floor screens do not use multi-tile KPI grids; show at most a single relevant large statistic within the task layout.
12. Motion and Feedback
Office
Hover scale may reach 1.02 with 150–200ms transitions.
Floor (Strictly Pessimistic)
No hover behavior. Use immediate press feedback and short, functional full-screen success/error feedback for scan results. Do not render success transitions for physical inventory movements until the server responds.
Accessibility
Respect prefers-reduced-motion throughout the application. Functional state changes remain visible even when decorative motion is reduced.
13. Accessibility
44px minimum office touch targets; 56px default floor targets; 64px floor primary actions.
WCAG AA for office experiences; WCAG AAA for time-critical floor content.
2px visible Vibrant Blue (#2563EB) focus ring on every interactive element.
Never communicate status by color alone.
No text below 16px on floor screens.
Respect reduced-motion preferences.
Scanner/keyboard focus must remain clearly visible.
14. Floor Device Performance
Assume rugged mid-tier Android scanner hardware rather than flagship devices.
No backdrop blur.
Keep animation lightweight.
Scanner input must become interactive before decorative assets finish loading.
Scan feedback should use simple, inexpensive rendering. Do not let images or visual decoration delay operational interaction.
15. Design Sequence and Review Gates
Align IA: Reconcile the Page & Role Map against the approved route registry, feature ownership, capability catalog, and launch/planned status.
Map tasks: Create task flows for receiving, pick/dispatch, transfer/inspection, FIFO override approval, and Organization Portal review.
Build foundations: Establish tokens, shell variants, navigation behavior, feedback states, and reusable patterns.
Prototype critical floor flows: Receive → Store/Hold, Pick → override request, Dispatch → acknowledgement receipt. Test at 375px and 430px portrait.
Design office and portal surfaces: Apply shared patterns to Inventory, Approvals, Enrollment, reporting, and Organization Portal screens.
Validate: Test with Warehouse Staff, Supervisor, Administrator, and representative Organization User. Include scan success, mismatch, duplicate, over-quantity, offline/Tier-2 block, expired approval, self-approval attempt, and unauthorized deep links.
Handoff: Annotate approved frames with route/surface, capability, data owner, component/pattern, responsive behavior, and acceptance criteria.
16. Acceptance Measures
The design is ready for handoff when:
A floor user can identify the next physical action, current item, and committed progress without scrolling or opening a menu.
Failed scans explicitly state the reason (What/Why) and recovery action on the same screen.
Successful Store/Hold/Dispatch actions visibly confirm the committed line only after server confirmation (Pessimistic UI).
No role sees navigation, controls, data fields, or financial information outside its approved capability or scope.
Every critical journey includes loading, empty, error, offline/online-required, and completion states.
Design review confirms token usage, contrast, touch targets, focus states, reduced motion, and responsive behavior.
17. Implementation Guidance
For a Next.js + Tailwind implementation:
Define the exact new design tokens (e.g., #2563EB to primary, #FFF7ED to background) in tailwind.config.ts.
Components consume tokens rather than introducing undocumented hex colors.
SVG/chart libraries must use exact documented tokens.
Base/unprefixed Tailwind classes represent floor/mobile behavior; md: and lg: progressively enhance larger layouts.
Load Etna Sans Serif and Glacial Indifference only at required weights. Do not load legacy fonts (Inter, JetBrains Mono).
Build and test floor components at 375px first.
Generated pick lists and acknowledgement receipts should follow the same approved design values.
18. Open Alignment Items
Before implementation, reconcile Page & Role Map labels and paths—especially Outgoing and Enrollment naming—with the approved navigation registry. Confirm ownership of discrepancies rather than creating alias routes or duplicate sidebar entries.
Planned document, reporting, billing, sync, and Organization Portal areas must remain visibly planned until their owning data contracts are live.
19. Governance
This unified document should be used alongside the approved Figma source of truth. New visual values, interaction rules, or component conventions should be documented and reviewed before shipping.
The guiding rule is simple:
Workflow determines what the user needs to do. The design system determines how that action is presented. Floor usability and data integrity (Pessimistic UI) take priority whenever the warehouseman performs the task.


