Here is the completely rewritten PART 2: PER-PAGE SPECIFICATIONS section. It seamlessly integrates the modern Bento-box aesthetic (floating elements, mega-cards, hyper-rounded corners), the strict typographic system, the pessimistic UI requirements, and the new Authentication flow.

PART 2: PER-PAGE SPECIFICATIONS
1. Authentication & Landing Page (The Gateway)
The landing experience establishes the modern, modular Bento-box aesthetic and provides highly secure, pessimistic feedback during the authentication process.

Desktop Layout (Split-Screen Bento): The viewport uses the Level 0 Cream White (#FFF7ED) canvas.

Left Column (Brand Context): A massive radius-xl (24px) floating Mega-Card containing Dyna-Serv branding, a welcome message in Etna Sans Serif, and subtle operational graphics.

Right Column (Auth Card): A Level 1 Solid White (#FFFFFF) floating radius-xl Mega-Card centered vertically, housing all forms.

Mobile Layout: The brand column is hidden. The Auth Card takes center stage, filling the screen (minus 16px padding).

Sign-In Flow: Bold headline-lg Etna greeting. Email/Password inputs (radius-md with 2px Vibrant Blue focus rings). Primary CTA is a radius-full (pill) Vibrant Blue button. Secondary options include a "Forgot Password?" text link and a "Sign in with Magic Link" outline button.

Magic Link & Password Recovery: Single Email input forms. Pessimistic UI applies strictly here: the primary button shows a loading state and must wait for server confirmation before displaying the Emerald checkmark success state ("Check Your Email").

Auth Error States: Strict 3-part error pattern rendered in Red (#EF4444) above inputs. (e.g., What: "Account Not Found". Why: "No active Dyna-Serv account associated with this email." Next Action: "Check for typos or contact Administrator.")

2. App Shell & Navigation
The application shell floats entirely on the Level 0 Cream White (#FFF7ED) canvas, separated by consistent 24px gutters on desktop. Edge-to-edge layouts are forbidden.

Floating Header (Desktop): A horizontal, independent pill (radius-full) at the top. Contains a pill-shaped global search bar, connection status, Approval-monitoring badge, and user profile avatar.

Floating Sidebar (Desktop): An independent vertical panel (radius-xl) on the left. Active items use a radius-full (pill) background in Vibrant Blue at 10% opacity, with Deep Navy text. Inactive items use Slate text.

Floating Tab Bar (Mobile Floor): Replaces the sidebar on mobile scanners. A floating pill (radius-full) 16px above the screen bottom. Must auto-hide entirely during active scan loops.

Organization Portal Shell: Scoped shell with strict "Your Organization" branding. No cross-organization switchers.

3. Dashboard
Layout: A Bento-box grid of Level 1 Solid White Mega-Cards (radius-xl) floating on the Cream White canvas. Floor users see a simplified, single-column vertical stack of radius-lg cards.

Metrics & Charts: High-level counts for Receiving, Picking, Transfer, and Inspection. Etna Sans Serif is used for all large numbers. Charts (Weekly CBM, outgoing KPIs) must use strictly documented Tailwind hex tokens.

Widgets: Open work queue list, recent activity feed, and system notifications.

Constraint: Financial metrics are explicitly capability-gated.

4. Receiving Hub
Work Queue Tab (Office): Filterable list of open Warehouse Receiving Reports (WRRs) housed inside a Mega-Card.

Receive Scan Loop (Floor): Scan-first interface taking over the full 375-430px bounds. Expected vs. scanned counters are prominently displayed. Constraint: Location suggestion renders only after an item scan success.

Pessimistic Commit: Tapping the 64px "Store" or "Hold" bottom CTA triggers a loading state. The Emerald success screen only appears after a 200 OK server response.

WRRs Tab (Office): Mega-Card forms to create, edit, and print WRRs. Includes the barcode generation and reprint UI.

Incoming Ledger (Office): Read-only data table of confirmed putaway history.

5. Master Inventory
Desktop Layout (The Mega-Card): Dense tables live inside a massive Level 1 Solid White radius-xl card. The card has overflow-hidden applied; if the table is too wide, it scrolls horizontally inside the Mega-Card to preserve the soft corners.

Inline Expansion: Clicking a row expands it vertically (accordion-style) to reveal the item → lot → location hierarchy. No modals.

Mobile Layout: Dense tables are banned. Each row transforms into its own vertically stacked radius-lg (16px) white card. Tapping a card expands it in place.

Pick Lists Tab: Interface to select Organization, Inventory Model, and Items. Shows transparent FEFO/FIFO allocation previews. Includes an explicit CTA for "FIFO Override Request".

Inspection Tab: Mega-card queue of aging inventory candidates showing lot, item, receiving date, and reason.

6. Pick and Dispatch (Floor Scan Loops)
Active Pick Queue: Vertical stack of radius-lg cards showing assigned pick tasks.

Pick Scan Loop: Full-screen active state hiding all navigation. Scanner-ready input for validation. Displays current instruction clearly (e.g., "Pick 5 of Item X from A1"). Contains recovery paths for mismatch feedback and FIFO overrides.

Dispatch Scan Loop: A physically separate final validation screen.

Success State: Full-screen confirmation of Delivery Receipt / Acknowledgement Receipt generation, strictly gated by pessimistic server confirmation.

7. Outgoing
Outgoing Ledger Tab: Desktop Mega-Card housing a read-only historical data table. Primary sort is "Date Released". Multi-parameter filtering (date, organization, inventory model).

Logistics Tab: Mega-Card interface for managing delivery/PEZA references and file uploads. Includes an "Add Charges" module requiring charge reason, amount, and evidence upload.

8. Master Data
All forms use Glacial Indifference text with visible Vibrant Blue focus rings (radius-md).

Organizations: Standard Mega-Card form capturing name, code, role classification, shipping origin, and billing details.

Items (Dynamic Form): The first field is Inventory Model. Subsequent fields populate conditionally based on this choice. Mandatory flow: Category → Subcategory → Item Code → UOM → CBM/Pallet Info → Barcode → Perishability.

Locations: Office-only view containing a bulk location generator. Features naming-convention config, capacity limits, and duplicate/error reporting. Deactivation buttons must say "Deactivate", never "Delete".

9. Settings & Account Administration
Accessed via the Account/Status region in the floating header or sidebar. Housed in desktop Mega-Cards.

Profile Tab: Individual user information and preferences.

Team Tab (Admin Only): RBAC assignment, capability-filtering, and user access management.

General Tab (Admin Only): High-level organizational preferences.

Security Tab: Password management and session controls.

10. Exceptions & Approvals (Supervisor Tools)
Approvals Queue: Mega-Card filterable list for FIFO overrides and out-of-sequence requests. The detail view must explicitly surface: Requester, Age, Reason, and Target Lot. The system hard-blocks self-approvals.

Inspections Queue: A unified resolution interface for items flagged "Hold" at receiving and items flagged during rack audits. Detail view features two primary actions: "Return to Stock" (Available) or "Reject" (Held/Written Off).

11. Billing and Pricing (Capability-Gated)
VMI Billing: Mega-Card data tables tracking daily accrual logic (Start/End Dates, Beginning, Inbound, Outbound, Ending, and Chargeable CBM).

SOA Generation: Layout for generating and previewing a printable 3-page Statement of Account PDF (Summary, Daily Charges, Running CBM movement).

Trading Pricing: Configuration forms enforcing strict calculation logic: Cost of Goods = Buy Cost, Selling Price = Customer Price, Gross Margin = Selling Price - Cost of Goods.

12. Organization Portal
Portal Home: A stripped-down, focused Bento dashboard showing only the logged-in organization's inventory and alerts. No internal warehouse operational controls are visible.

Pre-arrival Label Form: A clean, external-facing form inside a radius-xl card allowing clients to select items, input quantities/supplier lots, and generate inbound barcodes prior to physical arrival at the warehouse.