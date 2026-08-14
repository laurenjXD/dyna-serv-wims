# Structure & Naming — Dyna-Serv
Status: Approved

## User-Facing Terminology (use these terms across all UI screens, navigation, headers, forms, and client documentation)

| User-Facing Term | Replaces / Context | Technical / Canonical Database Term | Do Not Use in UI |
|---|---|---|---|
| **Organization** | Replaces `Party` in UI labels, navigation, headers, and user documentation | `party` / `parties` | Party, Supplier, Vendor |
| **Inventory Model** | Replaces `Flow Type` in UI forms, filters, tables, and headers (`'vmi'`, `'trading'`, `'supplies'`) | `flow_type` | Flow Type |
| **Organization Portal** | Replaces `Party Portal` for external customer/partner portal access | `party_user` / `/portal` | Party Portal, Vendor Portal, Client Portal |
| **Inspection** | Replaces `Daily Inspection` for aging inventory quality checks & pre-receiving triage | `inspection` / `inspection_id` | Daily Inspection, Quarantine Bay |
| **Delivery Receipt / Acknowledgement Receipt** | Replaces `Acknowledgement Receipt` in user-facing UI labels until formal document decision | `acknowledgement_receipt` | Withdrawal Slip |
| **Stock View** | Searchable stock view featuring expandable item → lot → location hierarchy under Inventory | `lot_location_balances` | Stock Browser |
| **Work Queue** | Filterable operational queue for open receiving WRRs, inspection, and picking execution | — | Open Tasks |
| **Incoming Ledger** | Confirmed receiving and putaway transaction history tab under Receiving | `inventory_transactions` (`movement_type = 'receiving'`) | Receiving History |
| **Outgoing Ledger** | Confirmed outbound dispatch history tab under Outgoing | `inventory_transactions` (`movement_type = 'pick'`) | Dispatch History |
| **Logistics** | Delivery status tracking, PEZA document uploads, and Add Charges tab under Outgoing | — | Logistics Manager |
| **Pre-arrival Label Form** | Organization Portal feature for generating item barcodes prior to shipment arrival | `shipment_labels` | Pre-arrival Form |

## Glossary (use these terms exactly — no synonyms across specs)
| Term | Definition | Do not use |
|---|---|---|
| `party` | Any vendor, customer, or end-customer — one table, role assigned per-transaction. User-facing UI label is **Organization**. | supplier, vendor (as a table name) |
| `item` | A product/SKU record | SKU (as a table/entity name) |
| `location` | A physical storage slot (`rack-level-position` label e.g., `A1-01`) | bin, warehouse location |
| `lot` | A physical instance of an item, partitioned by `flow_type` | batch (unless quoting a vendor's own lot number) |
| `flow_type` | `'vmi'`, `'trading'`, or `'supplies'` — the partition key on `lots`. User-facing UI label is **Inventory Model**. | — |
| `pick_list` | Operational document, generated at pick confirmation | — |
| `acknowledgement_receipt` | Priced document, generated in-system + printed for physical signature at handoff. User-facing UI label is **Delivery Receipt / Acknowledgement Receipt**. | withdrawal slip |
| `wrr` | Warehouse Receiving Receipt — inbound receipt verification document | receiving ticket, goods receipt |
| `cipl` | Commercial Invoice & Packing List — vendor shipping manifest reference | — |
| `receiving_bay` | Inbound unloading dock area for un-scanned incoming shipments (separate from storage racks) | receiving dock, unloading bay |
| `inspection` | Pre-receiving area for paper-vs-barcode cross-referencing, TDC, and damage/mismatch triage (stock here is NOT YET scanned or incremented in inventory). User-facing UI label is **Inspection**. | quarantine bay, holding area, daily inspection |
| `inventory_transaction` | Ledger record of physical stock changes (replaces `stock_entry`) | stock_entry, movement_log |
| `movement_type` | Category of stock movement (`'receiving'`, `'putaway'`, `'pick'`, `'transfer'`, `'reconciliation'`) | entry_type, transaction_type |
| `uom` | Unit of Measure (e.g. piece, carton, pallet) | unit_type, pack_unit |
| `spq` | Standard Packaging Quantity — number of base units (pieces) per carton/outer box | pieces_per_carton, pack_qty |
| `volume_cbm` | Cubic meters per box/outer carton (`(length_cm × width_cm × height_cm) / 1,000,000`) | cbm_size, volume_cubic |
| `dsgc_item_number` | Internal DSGC product/item reference code | dsgc_code, item_ref |
| `supplier_item_code` | Supplier's own product/part code mapping | supplier_sku, vendor_part_no |
| `customer_item_code` | Customer's own item/part code mapping | customer_sku, client_part_no |
| `spq_meter` | Standard Packaging Quantity in meters per roll (for roll/meter UOM items) | roll_length_meter, meters_per_roll |
| `boxes_per_pallet` | Number of outer cartons/boxes per full pallet layer | cartons_per_pallet, box_pallet_qty |
| `peza_number` | PEZA (Philippine Economic Zone Authority) permit reference number | peza_permit, peza_code |
| `commercial_invoice_no` | Commercial Invoice reference number (acts as CIPL number) | invoice_number, vendor_invoice, supplier_invoice_ref |
| `ip_number` | Import Permit (IP) reference number | import_permit, ip_code |
| `forex_rate` | Daily USD-to-PHP currency exchange rate for inventory valuation | exchange_rate, conversion_rate |
| `cycle_count` | Scheduled physical inventory audit of location stock | stocktake, physical_count |
| `inventory_reconciliation` | Adjustment record resolving variance between physical count and system records | stock_adjustment, stock_writeoff |
| `lot_number` | Business lot number sourced from the WRR and copied to the confirmed lot | vendor_lot_number, shipping_lot, batch_number |
| `item_code` | Primary identifier or SKU for an item | sku, part_number |
| `ar_reference_no` | Acknowledgement Receipt reference number (for outbound ledgers) | ar_no, out_ref |
| `dr_reference` | Delivery Receipt reference number (for dispatch/shipping) | delivery_no, shipment_ref |
| `fg` | Finished Goods (inventory classification) | finished_product |
| `for_process` | Raw material not yet finished (inventory classification) | raw_materials, wip |
| `loa` | Letter of Authority (PEZA/Customs regulatory fee) | authority_letter |
| `ctf` | Container Transfer Fee | transfer_fee |
| `handling_in` / `handling_out` | Billing charge based on volume of CBM physically moved | handling_fee, movement_charge |

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
See `brand-design-system.md` for colors, typography, and shape tokens. No spec should define its own visual tokens.
