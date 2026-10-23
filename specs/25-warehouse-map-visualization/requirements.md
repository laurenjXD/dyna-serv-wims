# Warehouse Map Visualization — Requirements

Status: Under Revision
Updated: 2026-10-23 — Final rack range and zone-only tracking clarification pending reapproval
Depends on: `specs/01-core-data-model/`, `specs/05-ui-shell-and-navigation/`, `specs/06-party-and-item-enrollment/`, and `specs/24-data-migration-and-seeding/`

## Purpose

Provide an interactive, read-only visualization of the single Dyna-Serv
warehouse layout using the `Racking ID` sheet in the supplied workbook as the
current location source. The map helps authorized staff locate stock, understand
location capacity, and navigate from a location record or Master Inventory.

The map is a visualization of canonical WIMS data. It is not a second
location registry, inventory ledger, capacity calculator, or migration source.

## Requirements

### R1. Canonical data source

The map SHALL read location identity from the canonical `locations` table and
live stock from the approved `lot_location_balances`/inventory read models. It
MUST NOT treat the PDF, workbook, SVG cells, browser state, or cached map data
as authoritative stock.

### R2. Initial layout

The first layout SHALL represent the workbook's rack groups A through I and
their visible level/position arrangement. Layout geometry SHALL be versioned
in application configuration for v1; editing geometry in the browser is out of
scope.

#### Final rack range amendment — 2026-10-23 (Pending Reapproval)

Canonical storage cells are rack A levels 1–4 with positions 1–30, and racks
B–I levels 1–4 with positions 1–15. RCV and Hold are zone-only tracking
records and SHALL not render as rack cells because they have no rack, level,
position, label, or capacity.

### R3. Locations view

The existing `/enrollment?tab=locations` surface SHALL provide a `Table View`
and `Map View` toggle. Table View SHALL include Storage, RCV, and Hold rows;
RCV/Hold rows remain visible there even though they have no rack-map cell. No
new sidebar entry is required for v1.

### R4. Location interaction

Selecting a mapped location SHALL show its label, rack, level, position,
location type, active state, capacity, occupied CBM, utilization percentage,
and current item/lot summary. The detail view SHALL link to the existing
location detail page.

### R5. Status and legend

The map SHALL distinguish at least inactive/unmapped, available, occupied,
near-capacity, and full states. Capacity thresholds SHALL reuse the approved
location-detail thresholds: warning at 75% and critical at 90% utilization.

PDF allocation colors SHALL remain a separate older reference/overlay layer
and MUST NOT be interpreted as live inventory status without an approved
business rule.

### R6. Search and filtering

Users with `locations.read` SHALL be able to search or filter by location
label, item, lot, organization, location type, and occupancy state. Matching
locations SHALL be visually emphasized and non-matching locations SHALL remain
discoverable through the table view.

### R7. Operational links

Master Inventory location results and location detail pages SHOULD provide a
`Locate on map` action that opens the map with the selected location focused.

### R8. Responsive behavior

Desktop/office users SHALL see the full rack layout with a detail panel. At
375–430px floor widths, the map SHALL provide rack-by-rack navigation, zoom or
focused location rendering, and an accessible location list; it MUST NOT rely
on rendering the entire warehouse drawing at unreadable scale.

### R9. Read-only safety

Map interaction SHALL NOT create, edit, deactivate, move, reserve, receive,
pick, or reconcile inventory. All mutations remain owned by their existing
feature workflows and capabilities.

### R10. Reference artifact

The supplied PDF MAY be available as an older reference/download artifact.
The workbook's location identifiers and geometry SHALL be treated as the
current reference, while capacity and stock remain canonical WIMS data.

## Out of scope

- bulk location generation or location import;
- changing `locations` schema or adding `warehouse_id`;
- adding new `location_type` enum values;
- browser-based map editor or drag-and-drop geometry editing;
- treating PDF or workbook color blocks as authoritative ownership or stock status;
- offline map mutations; and
- a second inventory or capacity ledger.

## Acceptance criteria

- An authorized user can switch between Location Table View and Map View.
- Every active canonical location that has a v1 layout mapping is rendered once.
- Selecting a location shows live capacity and stock data from canonical read
  models.
- Search and filters focus the correct map cells without exposing records
  outside the caller's `locations.read` scope.
- Unmapped or inactive locations are clearly reported and never silently
  represented as available.
- The map remains usable at 375px, 430px, 768px, and desktop widths.
- No map action changes inventory or master-data state.

## Sign-off

- Technical Lead: User / System, 2026-10-21
- Product/Operations Lead: User / System, 2026-10-21
