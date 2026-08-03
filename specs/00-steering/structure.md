# Structure & Naming — Hyperion 3PL / Dyna-Serv
Status: Approved

## Glossary (use these terms exactly — no synonyms across specs)
| Term | Definition | Do not use |
|---|---|---|
| `party` | Any vendor, customer, or end-customer — one table, role assigned per-transaction | supplier, vendor (as a table name) |
| `item` | A product/SKU record | SKU (as a table/entity name) |
| `location` | A physical storage slot (zone/rack/level) | bin, warehouse location |
| `lot` | A physical instance of an item, partitioned by `flow_type` | batch (unless quoting a vendor's own lot number) |
| `flow_type` | `'vmi'`, `'trading'`, or `'supplies'` — the partition key on `lots` | — |
| `pick_list` | Operational document, generated at pick confirmation | — |
| `acknowledgement_receipt` | Priced document, generated in-system + printed for physical signature at handoff | withdrawal slip |
| `wrr` | Warehouse Receiving Receipt — inbound receipt verification document | receiving ticket, goods receipt |
| `cipl` | Commercial Invoice & Packing List — vendor shipping manifest reference | — |
| `receiving_bay` | Inbound staging location where items are scanned and inspected before putaway | receiving dock, staging slot |
| `inventory_transaction` | Ledger record of physical stock changes (replaces `stock_entry`) | stock_entry, movement_log |
| `movement_type` | Category of stock movement (`'receiving'`, `'putaway'`, `'pick'`, `'transfer'`, `'reconciliation'`) | entry_type, transaction_type |
| `uom` | Unit of Measure (e.g. piece, carton, pallet) | unit_type, pack_unit |
| `spq` | Standard Packaging Quantity — number of base units (pieces) per carton/outer box | pieces_per_carton, pack_qty |
| `volume_cbm` | Cubic meters occupied per unit/carton (billed for VMI, reference-only for Trading/Supplies) | cbm_size, volume_cubic |
| `cycle_count` | Scheduled physical inventory audit of location stock | stocktake, physical_count |
| `inventory_reconciliation` | Adjustment record resolving variance between physical count and system records | stock_adjustment, stock_writeoff |

## Repo structure (single Next.js app — see kickoff doc §2c)
```
/app                    # Next.js App Router — route groups by role/area
/components
  /ui                   # primitives (button, card, etc.)
  /global               # shell components (nav, header, etc.)
  /[feature]             # created only once that feature's tasks.md is approved
/lib
  /db                   # Drizzle ORM schema definitions & connection client (Supabase Postgres)
  /supabase             # Supabase Auth, Storage, Realtime client setup
  /offline               # Tier 1 queue, sync manager
  /fifo                  # allocation + location suggestion engine
  /rbac                  # role resolution, permission checks
/supabase/migrations     # numbered, one concern per file, matches spec numbering loosely
```

## File/naming conventions
- Migration files: `NNNN_short_description.sql`, sequential, never renumbered after merge
- Every table name: lowercase, snake_case, plural
- Every spec folder: `NN-kebab-case-name` — number is positional, not a permanent ID (see kickoff doc §2b)

## Visual design
See `brand-design-system.md` for colors, typography, and the diagonal-cut motif. No spec should define its own visual tokens.
