# Warehouse Map Visualization — Design

Status: Under Revision
Updated: 2026-10-23 — Final rack range and zone-only tracking clarification pending reapproval
Depends on: `specs/25-warehouse-map-visualization/requirements.md`

## 1. Design intent

The map is an office-first read surface with a floor-usable focused-location
mode. It renders the physical layout as data-driven SVG so each location can
be selected, highlighted, and linked to canonical WIMS data. The workbook's
`Racking ID` sheet is the current rack-geometry reference; the previously
supplied PDF is retained only as an older visual reference and is not embedded
as the interactive data model.

## 2. Route and authorization

The v1 entry point is the existing Locations tab:

```text
/enrollment?tab=locations&view=map
```

The page continues to require `locations.read`. No new capability is created.
Creating, editing, and deactivating locations remains gated by
`locations.manage` and is not performed from the map.

## 3. Data flow

```text
locations
  + live location inventory/capacity read model
  -> server-authorized map query
  -> map view model keyed by canonical location label
  -> SVG rack layout + table/detail presentation
```

The map query SHALL return only the fields required for the current caller:
location identity, type, active state, capacity, occupied CBM, utilization,
status, and summarized item/lot references. It SHALL reuse the existing
location inventory projection and SHALL not duplicate the inventory ledger.

## 4. Layout configuration

The initial layout configuration is versioned application data containing:

- layout version and source reference;
- rack group identifier (`A` through `I`);
- rendered level count and position count;
- position order/orientation;
- normalized SVG bounds and labels; and
- explicit non-rack/reference regions where needed.

The configuration maps a canonical WIMS label such as `A1-01` to one SVG
cell. The workbook's position-level identifiers are normalized to WIMS's
level-position convention before they are used as map keys. Unmapped canonical
locations appear in an exceptions summary and remain available in Table View.

The final canonical storage geometry is A × 4 levels × 30 positions and
B–I × 4 levels × 15 positions. RCV/Hold tracking rows have no label and are
excluded from SVG rack-cell rendering while remaining available in table/list
views.

The v1 configuration MUST NOT invent CBM capacity, ownership, or allocation
status from the workbook. Capacity comes from canonical locations; the
workbook's rack geometry remains reference metadata until reconciled.

## 5. Interaction model

Desktop:

- full warehouse SVG on the left;
- legend, filters, and search above the map;
- selected-location detail panel on the right;
- keyboard focus and visible focus ring for every cell.

Mobile:

- rack selector or horizontal rack navigation;
- focused rack/cell rendering rather than a scaled full drawing;
- bottom sheet or stacked detail card for the selected location;
- accessible table/list fallback.

The selected location is reflected in the URL query string so a `Locate on
map` link remains shareable and reloadable.

## 6. Status calculation

Status is derived from active state and live capacity utilization:

```text
inactive/unmapped -> unavailable
occupied CBM <= 0 -> available
utilization >= 90% -> full/critical
utilization >= 75% -> near capacity/warning
otherwise -> occupied
```

The presentation layer may use approved design-system tokens only. PDF
allocation colors are shown only when an explicit reference overlay is enabled.

## 7. Failure and data-quality states

The map SHALL provide explicit states for loading, empty data, query failure,
unmapped locations, missing capacity, inactive locations, and stale data. A
missing capacity value MUST NOT be displayed as zero utilization or available
space.

## 8. Testing and verification

- unit-test label-to-cell mapping, rack orientation, status thresholds, and
  unmapped-location detection;
- test server query authorization and no cross-scope leakage;
- test map/table query synchronization and `Locate on map` deep links;
- Playwright coverage at 375px, 430px, 768px, and desktop widths;
- manually compare the rendered rack arrangement with the supplied PDF; and
- verify no map interaction invokes a stock or location mutation.

## Sign-off

- Technical Lead: User / System, 2026-10-21
- Product/Operations Lead: User / System, 2026-10-21
