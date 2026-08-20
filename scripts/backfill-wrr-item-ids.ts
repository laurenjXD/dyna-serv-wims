// One-time backfill: resolves wrr_items.item_id for existing lines that were
// created before lib/actions/receiving.ts's createWrr started resolving it
// automatically (2026-08-20 fix). Those older lines carry a non-null
// item_code but a null item_id, which permanently fails every floor scan
// against them as "unknown_item" (lib/receiving/scan-matcher.ts requires a
// non-null itemId to accept a match) — even when an item with a matching
// code/barcode is already enrolled in the catalog.
//
// Matches each affected line's item_code against the items catalog's code,
// supplier_item_code, dsgc_item_number, or barcode columns — same lookup
// createWrr now runs at creation time. Only unambiguous single matches are
// written; lines with zero or multiple catalog matches are left untouched
// and reported so a supervisor can resolve them by hand.
//
// Not part of the app runtime. Defaults to a dry run (reports what it would
// change, writes nothing). Pass --apply to actually update the rows:
//   npx tsx scripts/backfill-wrr-item-ids.ts            (dry run)
//   npx tsx scripts/backfill-wrr-item-ids.ts --apply     (writes)

// Plain `tsx` execution doesn't get Next.js's automatic .env.local loading —
// load it explicitly so DATABASE_URL is set before lib/db/client's first
// query (same requirement scripts/seed-dev-accounts.ts has, satisfied there
// only because it's always run through a Next-aware task runner).
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { db } from "../lib/db/client";
import { wrrItems } from "../lib/db/schema/wrr";
import { items as itemCatalog } from "../lib/db/schema/items";
import { wrrDocuments } from "../lib/db/schema/wrr";
import { and, eq, isNull, isNotNull, or } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

async function main() {
  const unlinkedLines = await db
    .select({
      id: wrrItems.id,
      wrrId: wrrItems.wrrId,
      wrrNumber: wrrDocuments.wrrNumber,
      itemCode: wrrItems.itemCode,
      lotNumber: wrrItems.lotNumber,
    })
    .from(wrrItems)
    .innerJoin(wrrDocuments, eq(wrrDocuments.id, wrrItems.wrrId))
    .where(and(isNull(wrrItems.itemId), isNotNull(wrrItems.itemCode)));

  if (unlinkedLines.length === 0) {
    console.log("No wrr_items rows with a null item_id and a non-null item_code. Nothing to do.");
    process.exit(0);
  }

  console.log(
    `${unlinkedLines.length} line(s) with item_code set but item_id null. Resolving against the items catalog…\n`,
  );

  let resolved = 0;
  let ambiguous = 0;
  let unmatched = 0;

  for (const line of unlinkedLines) {
    const itemCode = line.itemCode as string;
    const matches = await db
      .select({ id: itemCatalog.id, code: itemCatalog.code })
      .from(itemCatalog)
      .where(
        or(
          eq(itemCatalog.code, itemCode),
          eq(itemCatalog.supplierItemCode, itemCode),
          eq(itemCatalog.dsgcItemNumber, itemCode),
          eq(itemCatalog.barcode, itemCode),
        ),
      );

    if (matches.length === 0) {
      unmatched++;
      console.log(
        `  [no match]  ${line.wrrNumber} / lot ${line.lotNumber} — item_code "${itemCode}" matches no enrolled item.`,
      );
      continue;
    }

    if (matches.length > 1) {
      ambiguous++;
      console.log(
        `  [ambiguous] ${line.wrrNumber} / lot ${line.lotNumber} — item_code "${itemCode}" matches ${matches.length} catalog items (${matches.map((m) => m.code).join(", ")}). Skipped — resolve manually.`,
      );
      continue;
    }

    resolved++;
    const match = matches[0];
    console.log(
      `  [resolved]  ${line.wrrNumber} / lot ${line.lotNumber} — item_code "${itemCode}" -> item ${match.code} (${match.id})${APPLY ? "" : " (dry run — not written)"}`,
    );

    if (APPLY) {
      await db.update(wrrItems).set({ itemId: match.id }).where(eq(wrrItems.id, line.id));
    }
  }

  console.log(
    `\nDone. resolved=${resolved} ambiguous=${ambiguous} unmatched=${unmatched}${APPLY ? "" : " — dry run, no rows written. Re-run with --apply to write."}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
