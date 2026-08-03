# Product — Hyperion 3PL / Dyna-Serv
Status: Draft

## What this is
A hybrid warehouse inventory system running three business/inventory flows in parallel out of one physical warehouse:

- **VMI (Vendor Managed Inventory)** — the vendor owns the stock; the warehouse stores and manages it; billing is CBM occupied × rate × duration, averaged over a billing period (not per transaction).
- **Trading / 3PL** — the warehouse buys stock from a vendor and sells it to a customer; billing is a per-unit buy/sell margin, final and shown on the withdrawal documents.
- **Supplies / Internal Use** — warehouse supplies received and stored for internal operational use using the same receiving and inventory flows, but tracked separately so internal consumption/supplies inventory never mixes with VMI or Trading customer flows or billing.

## Who uses it
- **Warehouse staff** — receiving, picking, inspection (floor-based, hardware scanner-driven, needs offline support)
- **Supervisors** — approval queue, oversight dashboards, and enrollments of products 
- **Administrators** — system configuration, user & RBAC management, party/item master data administration, and global audit oversight
- **Parties** (vendors and customers, across both flows) — scoped self-service dashboards, no visibility into other parties' data
- Exact role granularity is under revision — see `02-rbac-roles`.

## Why it exists
Single-warehouse operators running consignment, owned-stock trading, and internal warehouse supplies today use disconnected systems or spreadsheets. This unifies all three under one schema, one approval/audit trail, and one set of physical location records — while keeping VMI, Trading, and Supplies data partitioned so billing, reporting, and internal usage never mix flows.
