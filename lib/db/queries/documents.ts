// lib/db/queries/documents.ts
//
// Party Portal — generated_documents reads scoped to the caller's own party.
//
// Traceability:
//   specs/22-parties-portal/design.md §7 (documents view), tasks.md Task 5
//     — "Build the pick_list/acknowledgement_receipt list and open flow
//     under documents.read (assigned_party)."
//   specs/10-pick-list-and-acknowledgement-receipt/design.md §2 —
//     generated_documents carries no party_id column; party ownership is
//     resolved only through its source chain.
//
// generated_documents.source_type + source_id point at the record the
// document was generated from — never directly at a party:
//   documentType 'pick_list'              -> sourceType 'inventory_commitment'
//     -> inventory_commitments.id -> inventory_commitments.pick_list_id
//     -> pick_lists.customer_party_id
//   documentType 'acknowledgement_receipt' -> sourceType 'inventory_transaction'
//     -> inventory_transactions.id -> inventory_transactions.pick_list_id
//     -> pick_lists.customer_party_id
//
// This is the only correct scoping path for this table; there is no
// shortcut party_id filter to apply directly on generated_documents. The
// caller MUST have already authorized `documents.read` scoped to this
// exact partyId via requirePermission before invoking either function
// below — the join below is the data-access-side half of that boundary,
// not a substitute for it.

import { and, desc, eq } from "drizzle-orm";
import { generatedDocuments } from "@/lib/db/schema/documents";
import { inventoryCommitments } from "@/lib/db/schema/commitments";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { pickLists } from "@/lib/db/schema/pick_lists";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

export type PartyDocumentRow = {
  id: string;
  documentNumber: string;
  status: string;
  generatedAt: Date | null;
  createdAt: Date;
};

/**
 * Party Portal — pick_list documents scoped to the caller's own party
 * (design.md §7 pick-lists tab).
 */
export async function listPartyPickListDocuments(
  db: DbLike,
  partyId: string,
): Promise<PartyDocumentRow[]> {
  return (await db
    .select({
      id: generatedDocuments.id,
      documentNumber: generatedDocuments.documentNumber,
      status: generatedDocuments.status,
      generatedAt: generatedDocuments.generatedAt,
      createdAt: generatedDocuments.createdAt,
    })
    .from(generatedDocuments)
    .innerJoin(
      inventoryCommitments,
      eq(inventoryCommitments.id, generatedDocuments.sourceId),
    )
    .innerJoin(pickLists, eq(pickLists.id, inventoryCommitments.pickListId))
    .where(
      and(
        eq(generatedDocuments.documentType, "pick_list"),
        eq(generatedDocuments.sourceType, "inventory_commitment"),
        eq(pickLists.customerPartyId, partyId),
      ),
    )
    .orderBy(desc(generatedDocuments.createdAt))) as PartyDocumentRow[];
}

/**
 * Party Portal — acknowledgement_receipt documents scoped to the caller's
 * own party (design.md §7 acknowledgement-receipts tab).
 */
export async function listPartyAcknowledgementReceiptDocuments(
  db: DbLike,
  partyId: string,
): Promise<PartyDocumentRow[]> {
  return (await db
    .select({
      id: generatedDocuments.id,
      documentNumber: generatedDocuments.documentNumber,
      status: generatedDocuments.status,
      generatedAt: generatedDocuments.generatedAt,
      createdAt: generatedDocuments.createdAt,
    })
    .from(generatedDocuments)
    .innerJoin(
      inventoryTransactions,
      eq(inventoryTransactions.id, generatedDocuments.sourceId),
    )
    .innerJoin(pickLists, eq(pickLists.id, inventoryTransactions.pickListId))
    .where(
      and(
        eq(generatedDocuments.documentType, "acknowledgement_receipt"),
        eq(generatedDocuments.sourceType, "inventory_transaction"),
        eq(pickLists.customerPartyId, partyId),
      ),
    )
    .orderBy(desc(generatedDocuments.createdAt))) as PartyDocumentRow[];
}
