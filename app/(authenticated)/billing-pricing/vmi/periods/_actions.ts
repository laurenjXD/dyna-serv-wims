"use server";

import { toUserMessage } from "@/lib/ui/user-messages";
import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { closeVmiPeriod, type VmiPeriodCloseResult } from "@/lib/billing/vmi-period-close";
import { recordVmiPayment, type VmiPaymentType } from "@/lib/billing/vmi-payments";
import { createVmiChargeLine } from "@/lib/actions/vmi-charge-lines";
import { ensureVmiDocumentArtifacts } from "@/lib/billing/vmi-document-artifacts";
import { issueVmiPeriodDocuments } from "@/lib/billing/vmi-period-issuance";
import { getStorageClient } from "@/lib/supabase/storage";
import { correctVmiPeriod } from "@/lib/billing/vmi-period-correction";
import { eq, inArray } from "drizzle-orm";
import { parties } from "@/lib/db/schema/parties";
import { generatedDocuments } from "@/lib/db/schema/documents";
import { vmiBillingPeriods } from "@/lib/db/schema/vmi_billing";
import { escapeHtmlText } from "@/lib/billing/input-validation";

export type PeriodCloseState = {
  ok?: boolean;
  result?: VmiPeriodCloseResult;
  documentWarning?: string;
  error?: string;
};

export async function closeVmiPeriodAction(
  _prevState: PeriodCloseState,
  formData: FormData,
): Promise<PeriodCloseState> {
  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return { ok: false, error: "You do not have permission to close VMI billing periods. Ask an administrator for access." };
  }

  if (!permResult.context.activeRoleKeys.includes("administrator")) {
    return { ok: false, error: "Only an Administrator can create VMI billing drafts. Ask an administrator to complete this action." };
  }

  const partyId = String(formData.get("partyId") ?? "").trim();
  const monthStr = String(formData.get("month") ?? "").trim();
  const yearStr = String(formData.get("year") ?? "").trim();

  if (!partyId) return { ok: false, error: "Select an Organization, then try again." };
  if (!/^(?:[0-9]|1[01])$/.test(monthStr) || !/^\d{4}$/.test(yearStr)) {
    return { ok: false, error: "Select a valid Month and Year, then create the billing draft again." };
  }
  const month = Number(monthStr);
  const year = Number(yearStr);
  if (year < 2000 || year > 2100) return { ok: false, error: "Year must be between 2000 and 2100. Enter a year in this range, then try again." };

  // Look up party code
  const [party] = await db
    .select({ id: parties.id, code: parties.code })
    .from(parties)
    .where(eq(parties.id, partyId))
    .limit(1);
  if (!party) return { ok: false, error: "The selected Organization is unavailable. Refresh the page and choose an active Organization." };

  const pad = (n: number) => String(n).padStart(2, "0");
  const monthNum = month + 1; // 1-12
  const periodStartDate = `${year}-${pad(monthNum)}-01`;
  const lastDay = new Date(year, monthNum, 0).getDate();
  const periodEndDate = `${year}-${pad(monthNum)}-${pad(lastDay)}`;
  const generationDate = new Date().toISOString().split("T")[0];

  try {
    const result = await closeVmiPeriod(db, {
      partyId,
      partyCode: party.code,
      billingCurrency: "USD",
      year,
      month: monthNum,
      periodStartDate,
      periodEndDate,
      generationDate,
    });

    let documentWarning: string | undefined;
    try {
      await ensureVmiDocumentArtifacts(db, {
        id: result.id,
        periodNumber: result.periodNumber,
        partyId: result.partyId,
        periodStartDate: result.periodStartDate,
        periodEndDate: result.periodEndDate,
        billingStatementTotalUsd: result.billingStatementTotalUsd,
        soaOpeningBalanceUsd: result.soaOpeningBalanceUsd,
        soaClosingBalanceUsd: result.soaClosingBalanceUsd,
        billingCurrency: result.billingCurrency,
      });
    } catch {
      documentWarning = "The draft was created, but document records could not be prepared. Open the draft and retry document preparation before issue.";
    }

    revalidatePath("/billing-pricing");
    revalidatePath("/reports");
    revalidatePath(`/billing-pricing/vmi/periods/${result.id}`);
    return { ok: true, result, documentWarning };
  } catch (err) {
    const message = toUserMessage(err, "Billing draft could not be created. Refresh the billing periods to check its status before trying again.");
    return { ok: false, error: message };
  }
}

export type VmiPaymentState = {
  ok?: boolean;
  paymentId?: string;
  error?: string;
};

export type VmiPeriodIssueState = { ok?: boolean; error?: string };
export type VmiPeriodCorrectionState = { ok?: boolean; replacementId?: string; error?: string };
export type VmiRedeliveryState = { ok?: boolean; error?: string };

export async function redeliverVmiDocumentsAction(_prev: VmiRedeliveryState, formData: FormData): Promise<VmiRedeliveryState> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "reporting.financial_read");
  if (permission.kind !== "authorized" || !permission.context.activeRoleKeys.includes("administrator")) return { ok: false, error: "Only an Administrator can redeliver VMI documents. Ask an administrator to complete this action." };
  const periodId = String(formData.get("periodId") ?? "");
  try {
    const [period] = await db.select({ periodNumber: vmiBillingPeriods.periodNumber, status: vmiBillingPeriods.status, email: parties.email, partyName: parties.name, billingStatementArtifactId: vmiBillingPeriods.billingStatementArtifactId, warehousingChargesArtifactId: vmiBillingPeriods.warehousingChargesArtifactId, soaArtifactId: vmiBillingPeriods.soaArtifactId, loaArtifactId: vmiBillingPeriods.loaArtifactId }).from(vmiBillingPeriods).innerJoin(parties, eq(parties.id, vmiBillingPeriods.partyId)).where(eq(vmiBillingPeriods.id, periodId)).limit(1);
    if (!period || period.status !== "issued") return { ok: false, error: "Only an issued billing period can be sent by email. Open an issued period and select Redeliver by email." };
    if (!period.email) return { ok: false, error: "The Organization has no billing email on record. Add an email address in Edit Organization, then try again." };
    const ids = [period.billingStatementArtifactId, period.warehousingChargesArtifactId, period.soaArtifactId, period.loaArtifactId].filter((id): id is string => Boolean(id));
    const docs = await db.select({ id: generatedDocuments.id, documentNumber: generatedDocuments.documentNumber, artifactPath: generatedDocuments.artifactPath, status: generatedDocuments.status }).from(generatedDocuments).where(inArray(generatedDocuments.id, ids));
    if (docs.length !== 4 || docs.some((doc) => doc.status !== "ready" || !doc.artifactPath)) return { ok: false, error: "The document email was not sent because all four issued PDFs are not ready. Review the issued documents and try again once they are ready." };
    const storage = await getStorageClient();
    const attachments = await Promise.all(docs.map(async (doc) => {
      const result = await storage.from("generated-documents").download(doc.artifactPath!);
      if (result.error) throw new Error(`Could not retrieve ${doc.documentNumber}.`);
      return { filename: `${doc.documentNumber}.pdf`, content: Buffer.from(await result.data.arrayBuffer()) };
    }));
    if (!process.env.RESEND_API_KEY) return { ok: false, error: "Document email is unavailable. Ask an administrator to configure email delivery." };
    const { Resend } = await import("resend");
    const from = process.env.RESEND_FROM_OPERATIONS ?? process.env.RESEND_FROM_EMAIL;
    if (!from) return { ok: false, error: "Document email is unavailable. Ask an administrator to configure the sender address." };
    const safePartyName = escapeHtmlText(period.partyName);
    const safePeriodNumber = escapeHtmlText(period.periodNumber);
    const sent = await new Resend(process.env.RESEND_API_KEY).emails.send({ from, to: [period.email], subject: `VMI billing documents — ${period.periodNumber}`, html: `<p>Dear ${safePartyName},</p><p>Your issued VMI billing documents for <strong>${safePeriodNumber}</strong> are attached.</p><p>Regards,<br/>Dyna-Serv Operations Team</p>`, attachments });
    if (sent.error) return { ok: false, error: toUserMessage(sent.error, "Document email could not be confirmed. Try again. If it happens again, contact an administrator.") };
    return { ok: true };
  } catch (cause) { return { ok: false, error: toUserMessage(cause, "Document email could not be confirmed. Try again. If it happens again, contact an administrator.") }; }
}

export async function correctVmiPeriodAction(_prev: VmiPeriodCorrectionState, formData: FormData): Promise<VmiPeriodCorrectionState> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "reporting.financial_read");
  if (permission.kind !== "authorized" || !permission.context.activeRoleKeys.includes("administrator")) return { ok: false, error: "Only an Administrator can correct an issued VMI period. Ask an administrator to complete this action." };
  const periodId = String(formData.get("periodId") ?? "");
  try {
    const replacement = await correctVmiPeriod(db, { periodId, actorId: permission.context.userId, generationDate: new Date().toISOString().slice(0, 10) });
    await ensureVmiDocumentArtifacts(db, {
      id: replacement.id, periodNumber: replacement.periodNumber, partyId: replacement.partyId,
      periodStartDate: replacement.periodStartDate, periodEndDate: replacement.periodEndDate,
      billingStatementTotalUsd: replacement.billingStatementTotalUsd,
      soaOpeningBalanceUsd: replacement.soaOpeningBalanceUsd, soaClosingBalanceUsd: replacement.soaClosingBalanceUsd,
      billingCurrency: replacement.billingCurrency,
    });
    revalidatePath("/billing-pricing");
    revalidatePath(`/billing-pricing/vmi/periods/${periodId}`);
    revalidatePath("/reports");
    revalidatePath(`/billing-pricing/vmi/periods/${replacement.id}`);
    revalidatePath("/reports");
    return { ok: true, replacementId: replacement.id };
  } catch (cause) { return { ok: false, error: toUserMessage(cause, "Correction draft could not be created. Refresh the billing period to check its status before trying again.") }; }
}

/** Issue is deliberately separate from draft close: it writes all four PDF
 * artifacts to private Storage before making the period immutable. */
export async function issueVmiPeriodAction(
  _prevState: VmiPeriodIssueState,
  formData: FormData,
): Promise<VmiPeriodIssueState> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "reporting.financial_read");
  if (permission.kind !== "authorized") return { ok: false, error: "You do not have permission to issue VMI billing periods. Ask an administrator for access." };
  if (!permission.context.activeRoleKeys.includes("administrator")) return { ok: false, error: "Only an Administrator can issue VMI billing documents. Ask an administrator to complete this action." };

  const periodId = String(formData.get("periodId") ?? "");
  if (!periodId) return { ok: false, error: "No billing period was selected. Return to billing periods and open a period, then try again." };

  try {
    const result = await issueVmiPeriodDocuments(db, await getStorageClient(), { periodId, actorId: permission.context.userId });
    if (!result.ok) return { ok: false, error: toUserMessage(result.error, "The billing period could not be issued. Refresh the period to check its status before trying again.") };
    revalidatePath("/billing-pricing");
    revalidatePath(`/billing-pricing/vmi/periods/${periodId}`);
    revalidatePath("/documents");
    revalidatePath("/reports");
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: toUserMessage(cause, "The billing period could not be issued. Refresh the period to check its status before trying again.") };
  }
}

export async function recordVmiPaymentAction(
  _prevState: VmiPaymentState,
  formData: FormData,
): Promise<VmiPaymentState> {
  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return { ok: false, error: "You do not have permission to record billing payments. Ask an administrator for access." };
  }

  if (!permResult.context.activeRoleKeys.includes("administrator")) {
    return { ok: false, error: "Only an Administrator can record billing payments. Ask an administrator to complete this action." };
  }

  const partyId = String(formData.get("partyId") ?? "").trim();
  const periodId = String(formData.get("periodId") ?? "").trim();
  const amountUsd = String(formData.get("amountUsd") ?? "").trim();
  const paymentDate = String(formData.get("paymentDate") ?? "").trim();
  const type = String(formData.get("type") ?? "payment").trim() as VmiPaymentType;
  const notes = String(formData.get("notes") ?? "").trim();

  try {
    const result = await recordVmiPayment(db, {
      partyId,
      periodId,
      amountUsd,
      paymentDate,
      type,
      notes,
      recordedByUserId: permResult.context.userId,
    });

    if (!result.ok) {
      return { ok: false, error: toUserMessage(result.errors, "Billing details were not saved. Review the form and try again.") };
    }

    revalidatePath("/billing-pricing");
    revalidatePath("/billing-pricing/soa");
    revalidatePath("/reports");
    return { ok: true, paymentId: result.paymentId };
  } catch (err) {
    const message = toUserMessage(err, "Payment could not be confirmed. Check the payment history before trying again. Contact an administrator if the result is unclear.");
    return { ok: false, error: message };
  }
}

export type VmiChargeLineState = {
  ok?: boolean;
  chargeLineId?: string;
  error?: string;
};

export async function createVmiChargeLineAction(
  _prevState: VmiChargeLineState,
  formData: FormData,
): Promise<VmiChargeLineState> {
  const resolver = await createPageResolver();
  const partyId = String(formData.get("partyId") ?? "").trim();
  const result = await createVmiChargeLine(resolver, {
    partyId,
    acknowledgementReceiptId: String(formData.get("acknowledgementReceiptId") ?? ""),
    chargeType: String(formData.get("chargeType") ?? ""),
    chargeDate: String(formData.get("chargeDate") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });

  if (!result.ok) {
    return { ok: false, error: toUserMessage(result.errors, "Billing details were not saved. Review the form and try again.") };
  }

  revalidatePath(`/billing-pricing/vmi/periods/${formData.get("periodId") ?? ""}`);
  revalidatePath("/billing-pricing");
  revalidatePath("/reports");
  return { ok: true, chargeLineId: result.chargeLine.id };
}
