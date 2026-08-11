# Brand Identity & Design System — Dyna-Serv
Status: Approved. Single source of truth, alongside Stitch Project `205153318355289845`.

This replaces all prior brand documents. Where anything else conflicts with this doc, this doc wins — log the conflict in `revision-log.md`.

**Design priority, stated explicitly:** the warehouseman on a mobile scanner is the primary user this system is optimized for, not the supervisor at a desktop. Every decision below defaults to floor/mobile constraints first; desktop/office screens are the secondary case that gets to use the extra space.

---

## 1. Color System

The visual style is **Corporate Modern with Functional Industrial influences**. It prioritizes clarity over decoration, using a structured grid, purposeful color coding, and robust interactive elements.

### 1.1 Brand colors
| Token | Hex | Usage |
|---|---|---|
| `primary` | `#1E293B` | Deep Slate. Used for navigation, headers, and structural elements. |
| `secondary` | `#0F172A` | Navy. Used for secondary structural elements. |
| `action-blue` | `#3B82F6` | Functional Blue. Reserved for primary interactive elements and call-to-actions. |

**Text-color rule:** Headings, labels, and body copy are always `on-surface` or a dark neutral. Brand colors are for backgrounds, icons, borders, active-state fills, and chart marks only.

### 1.2 Neutrals
| Token | Hex | Usage |
|---|---|---|
| `surface` | `#F8F9FF` | Primary content background (Slate 50). |
| `surface-dim` | `#CBDBF5` | Slightly darker background for layering. |
| `on-surface` | `#0B1C30` | Default text color. |
| `on-surface-variant` | `#45474C` | Secondary text color, lighter text. |
| `outline` | `#75777D` | Standard borders. |
| `outline-variant` | `#C5C6CD` | Subtle card borders (Slate 200). |

### 1.3 Status colors (semantic)
| Token | Hex | Meaning |
|---|---|---|
| `status-success` | `#059669` | Forest Green: Confirmed, Stocked, Success |
| `status-warning` | `#D97706` | Amber: Warnings, FIFO Overrides, Low Stock |
| `status-error` | `#DC2626` | Crimson: Quarantined, Exceptions, Damaged Goods |

**Floor-specific rule:** Status color alone is never the only signal on a floor screen — every status also carries an icon or full-screen flash pattern.

---

## 2. Typography

| Family | Role | Weights used |
|---|---|---|
| **Inter** | Headings, data-display numbers, body copy, functional labels | ExtraBold (800), Bold (700), SemiBold (600), Medium (500), Regular (400) |
| **JetBrains Mono** | Codes, IDs, SKU numbers, Bin Locations | Regular (400), Medium (500), Bold (700) |

### Type scale
| Style | Size | Line height | Tracking |
|---|---|---|---|
| display-lg | 36px | 44px | -0.02em |
| headline-lg | 28px | 34px | normal |
| headline-lg-mobile | 24px | 30px | normal |
| headline-md | 20px | 28px | normal |
| body-lg-mobile | 18px | 26px | normal |
| body-lg | 16px | 24px | normal |
| body-md | 14px | 20px | normal |
| body-sm | 12px | 16px | normal |
| label-md | 12px | 12px | 0.05em |
| mono-md | 14px | 20px | normal |

**Floor-specific minimum:** Scale body text to `body-lg-mobile` (18px) to ensure readability at arm's length while holding a scanner.

---

## 3. Device & Interaction Priority

- **Desktop (Office):** 12-column fluid grid. Content is organized in "Card Containers" to separate different warehouse zones or data sets. Sidebars are collapsible to maximize horizontal space for large tables.
- **Mobile (Floor):** Single column layout with high-contrast vertical stacking.
- **Touch Targets:** All interactive elements on mobile must have a minimum height of 48px to accommodate gloved use or rapid scanning.

---

## 4. Spacing & Layout

- Base unit: **4px** baseline grid to maintain alignment in dense data environments.
- Desktop padding: `sm` (8px) padding for table cells, `24px` margins.
- Mobile padding: `md` (16px) or `lg` (24px) for list items.

---

## 5. Shape

The shape language is **Soft (0.25rem / 4px)**, reflecting the precision of industrial equipment.

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 4px | Standard inputs, buttons, cards |
| `radius-md` | 8px | Mobile scan buttons, prominence status badges |
| `radius-lg` | 16px | Modals |
| `radius-full` | 9999px | Circular pills |

---

## 6. Elevation & Depth

This design system utilizes **Tonal Layering and Low-Contrast Outlines** rather than heavy shadows to maintain a clean, industrial look.

| Level | Surface | Shadow | Used for |
|---|---|---|---|
| 0 (Surface) | `#F8F9FF` (Slate 50) | none | Base page background |
| 1 (Card) | White surface, 1px border (`#C5C6CD`) | none | Standard container for data |
| 2 (Overlay) | White surface | `0px 4px 12px rgba(0,0,0,0.08)` | Dropdowns, scan-modals |

**Active State:** Elements currently being edited or scanned receive a 2px stroke in Action Blue.

---

## 7. Component Guidance

**Buttons**
- Primary: Solid Action Blue with white text.
- Secondary: White background with 1px Slate 300 border (`outline-variant`).
- Floor-Primary: Full-width on mobile, 56px height for "Confirm Pick" or "Complete Ship" actions.

**Status Badges**
- Staged: Blue tint.
- Confirmed: Green tint.
- Quarantined: Red tint.
- Held: Amber tint.
- All badges use a "subtle" style: light background with high-contrast text.

**Input Fields**
- Barcode Input: Features a dedicated "Scan" icon inside the trailing edge. High-contrast border (Slate 400) to ensure the target is visible.
- Numeric Stepper: Large '+' and '-' buttons for mobile quantity adjustments.

**Data Tables (Office)**
- Zebra striping (Slate 50) for readability. Fixed headers for long lists.

**Inventory Cards (Mobile)**
- Large SKU headline. Prominent "Qty on Hand" counter. Clear bin location (e.g., **A-12-04**) in bold monospace.
