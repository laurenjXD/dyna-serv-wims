// `billing-ledger-service.ts` — Immutable Double-Entry Billing Ledger Service
//
// Records operational billing events and posts immutable debit/credit entries
// to the billing_ledger table. Provides reversal and adjustment mechanisms
// to preserve full financial auditability.

import { db } from "@/lib/db/client";
import { billingEvents, billingLedger, creditDebitMemos } from "@/lib/db/schema/billing_ledger";
import { eq, and, gte, lte } from "drizzle-orm";

export interface RecordEventInput {
  sourceTransactionId: string;
  sourceTransactionType: string;
  contractId?: string;
  contractVersionId?: string;
  partyId: string;
  chargeCategory: string;
  quantity: number;
  unit: string;
  rate: number;
  currency?: string;
  amountUsd: number;
  taxAmountUsd?: number;
  billingPeriodId?: string;
  createdByUserId: string;
}

export interface PostLedgerEntryInput {
  entryDate: string; // YYYY-MM-DD
  referenceNumber: string;
  partyId: string;
  contractId?: string;
  billingEventId?: string;
  entryType: "debit" | "credit" | "adjustment" | "reversal" | "void" | "credit_memo" | "debit_memo";
  chargeCategory: string;
  debitAmountUsd?: number;
  creditAmountUsd?: number;
  currency?: string;
  exchangeRate?: number;
  notes?: string;
  billingPeriodId?: string;
  createdByUserId: string;
}

/**
 * Records a billable operational event into the billing_events table.
 */
export async function recordBillingEvent(input: RecordEventInput) {
  const [event] = await db
    .insert(billingEvents)
    .values({
      sourceTransactionId: input.sourceTransactionId,
      sourceTransactionType: input.sourceTransactionType,
      contractId: input.contractId,
      contractVersionId: input.contractVersionId,
      partyId: input.partyId,
      chargeCategory: input.chargeCategory,
      quantity: String(input.quantity),
      unit: input.unit,
      rate: String(input.rate),
      currency: input.currency ?? "USD",
      amountUsd: String(input.amountUsd),
      taxAmountUsd: String(input.taxAmountUsd ?? 0),
      billingPeriodId: input.billingPeriodId,
      status: "pending",
      createdByUserId: input.createdByUserId,
    })
    .returning();

  return event;
}

/**
 * Posts an entry to the immutable billing_ledger table.
 */
export async function postLedgerEntry(input: PostLedgerEntryInput) {
  const [entry] = await db
    .insert(billingLedger)
    .values({
      entryDate: input.entryDate,
      referenceNumber: input.referenceNumber,
      partyId: input.partyId,
      contractId: input.contractId,
      billingEventId: input.billingEventId,
      entryType: input.entryType,
      chargeCategory: input.chargeCategory,
      debitAmountUsd: String(input.debitAmountUsd ?? 0),
      creditAmountUsd: String(input.creditAmountUsd ?? 0),
      currency: input.currency ?? "USD",
      exchangeRate: String(input.exchangeRate ?? 1),
      notes: input.notes,
      billingPeriodId: input.billingPeriodId,
      createdByUserId: input.createdByUserId,
    })
    .returning();

  return entry;
}

/**
 * Reverses a posted ledger entry by creating a matching counter-entry (Credit for Debit / Debit for Credit).
 */
export async function reverseLedgerEntry(
  originalEntryId: string,
  reversalReason: string,
  userId: string
) {
  const [original] = await db
    .select()
    .from(billingLedger)
    .where(eq(billingLedger.id, originalEntryId));

  if (!original) {
    throw new Error(`Ledger entry ${originalEntryId} not found.`);
  }

  const currentDate = new Date().toISOString().split("T")[0];

  const [reversal] = await db
    .insert(billingLedger)
    .values({
      entryDate: currentDate,
      referenceNumber: `REV-${original.referenceNumber}`,
      partyId: original.partyId,
      contractId: original.contractId,
      billingEventId: original.billingEventId,
      entryType: "reversal",
      chargeCategory: original.chargeCategory,
      // Reverse debit to credit and vice versa
      debitAmountUsd: original.creditAmountUsd,
      creditAmountUsd: original.debitAmountUsd,
      currency: original.currency,
      exchangeRate: original.exchangeRate,
      notes: `Reversal of ${original.referenceNumber}: ${reversalReason}`,
      billingPeriodId: original.billingPeriodId,
      createdByUserId: userId,
    })
    .returning();

  return reversal;
}

/**
 * Issues a Credit Memo or Debit Memo adjustment for a party.
 */
export async function issueAdjustmentMemo(input: {
  memoNumber: string;
  partyId: string;
  contractId?: string;
  billingPeriodId?: string;
  type: "credit_memo" | "debit_memo";
  amountUsd: number;
  reason: string;
  userId: string;
}) {
  const [memo] = await db
    .insert(creditDebitMemos)
    .values({
      memoNumber: input.memoNumber,
      partyId: input.partyId,
      contractId: input.contractId,
      billingPeriodId: input.billingPeriodId,
      type: input.type,
      amountUsd: String(input.amountUsd),
      reason: input.reason,
      status: "issued",
      issuedByUserId: input.userId,
    })
    .returning();

  // Post corresponding entry to the billing ledger
  const currentDate = new Date().toISOString().split("T")[0];
  await postLedgerEntry({
    entryDate: currentDate,
    referenceNumber: input.memoNumber,
    partyId: input.partyId,
    contractId: input.contractId,
    entryType: input.type,
    chargeCategory: "adjustment",
    debitAmountUsd: input.type === "debit_memo" ? input.amountUsd : 0,
    creditAmountUsd: input.type === "credit_memo" ? input.amountUsd : 0,
    notes: input.reason,
    billingPeriodId: input.billingPeriodId,
    createdByUserId: input.userId,
  });

  return memo;
}
