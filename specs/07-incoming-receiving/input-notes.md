# Input Notes — Pre-Receiving Workflow (CIPL / WRR / Staged Receiving)

Status: Raw input, not yet formalized into requirements.md
Captured: this session, before 01-core-data-model was drafted
Informs: 01-core-data-model (schema implications below), then this spec (07) directly

Source: description provided by product owner, workflow-first (not schema-first). Preserved close to as-given, with the schema implications called out separately so nothing is silently reinterpreted when this becomes formal requirements.

---

## The workflow, as described

1. **CIPL & Packing List (pre-receiving)** — A CIPL (Commercial Invoice & Packing List) and packing list arrive by email. A back-office user encodes this into the system as a new WRR (Warehouse Receiving Report).

2. **Staging ("standby database")** — The WRR sits in a staging state. It does not touch active inventory (`lots`, `stock_levels`) yet. The system knows items are expected but they are not pickable.

3. **Printing the WRR** — The system generates a printable WRR. Floor staff use the printed sheet as their reference when the delivery truck arrives.

4. **Barcode scanning (physical confirmation)** — Floor staff scan each carton per pallet. Each scan is checked off against the staged WRR — confirming physical reality matches what the CIPL declared.

5. **Commit to the ledger** — Once all scanning is done and staff click "Confirm Receipt," the WRR flips from staged to received. **Only at this point** do `lots` and `stock_levels` actually update. This is the moment the transaction becomes part of the permanent incoming ledger.

6. **Discrepancy handling** — If a scanned item isn't on the WRR (wrong item shipped, or a genuinely new item never seen before), the system pauses and triggers standalone enrollment (already exists in the design as the receiving-side unverified-item fallback) before continuing.

---

## Schema implications flagged for 01-core-data-model

These are not decisions yet — just what needs to be resolved when 01 is drafted, so this workflow doesn't get silently designed around ad hoc later:

1. **`stock_entries.status` needs a `pending_arrival` value**, distinct from the existing draft/pending/approved/rejected/fulfilled set — and needs to be clear that this status applies specifically to `entry_type = 'receipt'`, not to withdrawal entries. Open question: does `stock_entries` need an `entry_type`-conditional status enum, or two logically separate lifecycles sharing one table?

2. **A WRR is a new document concept**, separate from `pick_list` and `acknowledgement_receipt` (both of which are withdrawal-side). Open question: is WRR a third `documents.type` value, or does it deserve its own table given it has a materially different lifecycle (generated pre-arrival from an external source, reconciled against scans, only then "confirmed")?

3. **CIPL is an external input**, arriving by email. Open question: does the system need any structured representation of CIPL line items for the reconciliation step (#4 above) to actually check scans against, or is the WRR itself the system's structured version of the CIPL (i.e., back-office manually transcribes CIPL → WRR, and CIPL itself is just an attached reference document, not parsed data)?

4. **Reconciliation logic**: scanning needs to check each carton against expected WRR line items (item + qty), not just resolve a location suggestion — this is a real matching step, with a pass/fail per line, not just "scan, get a location, confirm." This likely needs its own child table (WRR lines) separate from the eventual `lots` it produces.

5. **This mirrors, but is distinct from, the two-stage commitment model** already flagged for revision in `12`/withdrawal-side specs — same "declare intent before it's real" shape, but on the inbound side. Worth checking whether one general "staged → committed" pattern can serve both directions, or whether they're different enough to need separate schema treatment. This is exactly the kind of cross-cutting question 01 exists to resolve before 07 and 08 are drafted.
