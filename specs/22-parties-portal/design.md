# Organization Portal — Design

Status: Approved
Updated: 2026-08-14 (Aligned with Unified UI/UX & Visual Design System)

## 1. Design intent

The Organization Portal is an authenticated, external, office/desktop-first self-service surface for the `party_user` role. It is a read/consume surface backed by `02-rbac-roles`, `01-core-data-model`, `10-pick-list-and-acknowledgement-receipt`, `12-vmi-billing`, `13-trading-orders-and-pricing`, and `14-notifications-and-alerts`.

The design follows `specs/00-steering/brand-design-system.md` office-context rules with solid Level 0 Cream White (`#FFF7ED`) background and Level 1 Solid White (`#FFFFFF`) cards with subtle shadow `0 1px 2px rgba(15,23,42,0.08)`. Zero glassmorphism or backdrop blur.

### Terminology Alignment
Across all portal design components, route layouts, and mockups:
- **Organization Portal** replaces Party Portal.
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Delivery Receipt / Acknowledgement Receipt** replaces Acknowledgement Receipt.
- **Pre-arrival Label Form** replaces Supplier Pre-labeling.

*(Note: `parties`, `party_user`, `user_party_scopes`, and `flow_type` remain canonical database identifiers.)*

## 2. Route Architecture

Routes fold cleanly into the shared `app/(authenticated)/` layout:

```text
app/(authenticated)/
  portal/
    page.tsx                    # Organization Home: context-aware summary (VMI position or Trading orders)
    inventory/
      page.tsx                  # Organization Stock: VMI lot_location_balances position + embedded VMI analytics
    orders/
      page.tsx                  # Orders: Trading pick_lists list + embedded Trading analytics
      [pickListId]/page.tsx     # Order detail with snapshot lines/price
    documents/
      page.tsx                  # Documents: combined pick_lists, Delivery Receipts / Acknowledgement Receipts, VMI statements
      [documentId]/page.tsx     # Document preview + signed-URL download
    notifications/
      page.tsx                  # Organization Notifications: scoped in-app notification center
    labels/
      page.tsx                  # Pre-arrival Label Form: 1D shipment label generation (WAN:<uuid>)
```

## 3. Visual Design & Typography Rules

1. Palette: `#2563EB` Vibrant Blue primary, `#0F172A` Deep Navy text primary, `#64748B` Slate text secondary, `#FFF7ED` Cream White background, `#FFFFFF` Solid White surface.
2. Typography: **Etna Sans Serif** (Bold/SemiBold) for Headings/Displays; **Glacial Indifference** (Bold/Regular) for UI, body, labels, badges, buttons, tables.
3. 3-Component Error Feedback: Every error boundary, modal, or toast displays **What happened**, **Why it failed**, and **Next Action / Solution**.
4. Touch targets: Standard office 44px touch targets.
