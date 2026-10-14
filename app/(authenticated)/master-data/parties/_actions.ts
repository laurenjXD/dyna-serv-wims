"use server";

// Next.js 15 server action wrappers for party enrollment.
// These thin wrappers:
//   1. Create the per-request auth resolver from the Supabase SSR session.
//   2. Parse FormData into typed input objects.
//   3. Delegate to the pure action functions in lib/actions/parties.ts.
//   4. Map results to the FormState shape consumed by useActionState().
//
// Traceability:
//   lib/actions/parties.ts — pure action functions
//   specs/06-party-and-item-enrollment/design.md §4, §5, §5a

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { db } from "@/lib/db/client";
import { partyRoles } from "@/lib/db/schema/parties";
import { eq } from "drizzle-orm";

import {
  createParty,
  updateParty,
  deactivateParty,
  addPartyRole,
  removePartyRole,
  contactParty,
} from "@/lib/actions/parties";
import type { ContactPartyEmailPayload } from "@/lib/actions/parties";

// ---------------------------------------------------------------------------
// FormState — shared across all party forms
// ---------------------------------------------------------------------------

export type PartyFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nullableString(value: FormDataEntryValue | null): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function formatNotesWithRbe(notes: string | null, rbeList: string[]): string | null {
  const cleanNotes = notes ? notes.replace(/^\[RBE:\s*[^\]]+\]\s*\n?/i, "").trim() : "";
  if (rbeList.length === 0) return cleanNotes || null;
  const header = `[RBE: ${rbeList.join(", ")}]`;
  return cleanNotes ? `${header}\n${cleanNotes}` : header;
}

// ---------------------------------------------------------------------------
// createPartyAction
// ---------------------------------------------------------------------------

export async function createPartyAction(
  _prevState: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const resolver = await createPageResolver();

  const rawNotes = nullableString(formData.get("notes"));
  const rbeValues = formData
    .getAll("rbe")
    .filter((v): v is string => typeof v === "string" && ["EE", "ELSE", "ETC"].includes(v.toUpperCase()));
  const formattedNotes = formatNotesWithRbe(rawNotes, rbeValues.map((v) => v.toUpperCase()));

  const input = {
    code: formData.get("code"),
    name: formData.get("name"),
    contactPerson: nullableString(formData.get("contactPerson")),
    email: nullableString(formData.get("email")),
    phone: nullableString(formData.get("phone")),
    taxId: nullableString(formData.get("taxId")),
    address1: nullableString(formData.get("address1")),
    address2: nullableString(formData.get("address2")),
    paymentTerms: nullableString(formData.get("paymentTerms")),
    notes: formattedNotes,
    isActive: formData.get("isActive") !== "false",
  };

  const result = await createParty(resolver, input);

  if (!result.ok) {
    if ("fieldErrors" in result) {
      return { fieldErrors: result.fieldErrors };
    }
    return { error: result.error };
  }

  const partyId = result.data.id;

  // Add selected roles (best-effort; roles can be added on the detail page)
  const roleValues = formData.getAll("roles");
  for (const role of roleValues) {
    if (typeof role === "string" && role.trim()) {
      await addPartyRole(resolver, partyId, role);
    }
  }

  revalidatePath("/master-data/parties");
  revalidatePath("/enrollment");
  redirect(`/master-data/parties/${partyId}`);
}

// ---------------------------------------------------------------------------
// updatePartyAction
// ---------------------------------------------------------------------------

export async function updatePartyAction(
  _prevState: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const resolver = await createPageResolver();

  const id = formData.get("id") as string;
  const submittedUpdatedAt = formData.get("updatedAt") as string;

  const rawNotes = nullableString(formData.get("notes"));
  const rbeValues = formData
    .getAll("rbe")
    .filter((v): v is string => typeof v === "string" && ["EE", "ELSE", "ETC"].includes(v.toUpperCase()));
  const formattedNotes = formatNotesWithRbe(rawNotes, rbeValues.map((v) => v.toUpperCase()));

  const input = {
    code: formData.get("code"),
    name: formData.get("name"),
    contactPerson: nullableString(formData.get("contactPerson")),
    email: nullableString(formData.get("email")),
    phone: nullableString(formData.get("phone")),
    taxId: nullableString(formData.get("taxId")),
    address1: nullableString(formData.get("address1")),
    address2: nullableString(formData.get("address2")),
    paymentTerms: nullableString(formData.get("paymentTerms")),
    notes: formattedNotes,
    isActive: formData.get("isActive") !== "false",
  };

  const result = await updateParty(resolver, id, input, submittedUpdatedAt);

  if (!result.ok) {
    if ("fieldErrors" in result) {
      return { fieldErrors: result.fieldErrors };
    }
    if (result.error === "Conflict") {
      return {
        error:
          "This record was updated by someone else after you opened the form. Please reload the page to see the latest version before editing.",
      };
    }
    return { error: result.error };
  }

  // Reconcile business roles across party_roles
  const submittedRoles = formData
    .getAll("roles")
    .filter((r): r is string => typeof r === "string" && r.trim() !== "");

  try {
    const existingRoles = await db
      .select({ id: partyRoles.id, role: partyRoles.role })
      .from(partyRoles)
      .where(eq(partyRoles.partyId, id));

    const existingRoleValues = existingRoles.map((r) => r.role as string);

    // Add newly checked roles
    for (const newRole of submittedRoles) {
      if (!existingRoleValues.includes(newRole)) {
        await addPartyRole(resolver, id, newRole);
      }
    }

    // Remove unchecked roles
    for (const existing of existingRoles) {
      if (!submittedRoles.includes(existing.role)) {
        await removePartyRole(resolver, id, existing.id);
      }
    }
  } catch (err) {
    console.error("Failed to reconcile party roles on update:", err);
  }

  revalidatePath("/master-data/parties");
  revalidatePath("/enrollment");
  revalidatePath(`/master-data/parties/${id}`);
  redirect(`/master-data/parties/${id}`);
}

// ---------------------------------------------------------------------------
// deactivatePartyAction
// ---------------------------------------------------------------------------

export async function deactivatePartyAction(
  _prevState: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const resolver = await createPageResolver();
  const id = formData.get("id") as string;

  const result = await deactivateParty(resolver, id);

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/master-data/parties");
  revalidatePath("/enrollment");
  revalidatePath(`/master-data/parties/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// addPartyRoleAction
// ---------------------------------------------------------------------------

export async function addPartyRoleAction(
  _prevState: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const resolver = await createPageResolver();
  const partyId = formData.get("partyId") as string;
  const role = formData.get("role") as string;

  const result = await addPartyRole(resolver, partyId, role);

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/master-data/parties/${partyId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// removePartyRoleAction
// ---------------------------------------------------------------------------

export async function removePartyRoleAction(
  _prevState: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const resolver = await createPageResolver();
  const partyId = formData.get("partyId") as string;
  const roleRowId = formData.get("roleRowId") as string;

  const result = await removePartyRole(resolver, partyId, roleRowId);

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/master-data/parties/${partyId}`);
  return { ok: true };
}

import { generateBrandedEmailHtml } from "@/lib/notifications/email-composer-templates";

async function sendEmailViaResend(
  payload: ContactPartyEmailPayload,
): Promise<void> {
  // Resend integration using 04-services-and-infrastructure's pipeline.
  // The template_key and resource_type follow the email_deliveries contract.
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from =
    process.env.RESEND_FROM_OPERATIONS ?? "noreply@example.com";

  const emailSubject = payload.subject?.trim() || "Message from Dyna-Serv Operations";
  const attachmentNames = payload.attachments?.map((a) => a.filename) ?? [];

  const html = generateBrandedEmailHtml({
    partyName: payload.partyName ?? "Valued Partner",
    contactPerson: payload.recipientName,
    subject: emailSubject,
    templateCategory: payload.templateCategory ?? "general",
    messageBody: payload.optionalMessage || "You have received an operational notification from Dyna-Serv Warehouse Operations.",
    attachmentNames,
  });

  const resendAttachments = payload.attachments?.map((att) => ({
    filename: att.filename,
    content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content),
  }));

  await resend.emails.send({
    from,
    to: [payload.recipientEmail],
    cc: payload.cc ? (Array.isArray(payload.cc) ? payload.cc : [payload.cc]) : undefined,
    subject: emailSubject,
    html,
    attachments: resendAttachments && resendAttachments.length > 0 ? resendAttachments : undefined,
  });
}

export async function contactPartyAction(
  _prevState: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const resolver = await createPageResolver();
  const partyId = formData.get("partyId") as string;
  const message = nullableString(formData.get("message"));
  const subject = nullableString(formData.get("subject"));
  const cc = nullableString(formData.get("cc"));
  const templateKey = (formData.get("templateKey") as string | null) ?? "custom_message";
  const templateCategory = (formData.get("templateCategory") as string | null) ?? "general";

  // Parse attached files
  const fileEntries = formData.getAll("files");
  const attachments: import("@/lib/enrollment/contact-party").ContactPartyEmailAttachment[] = [];

  for (const entry of fileEntries) {
    if (entry instanceof File && entry.size > 0) {
      if (entry.size > 10 * 1024 * 1024) {
        return { error: `File "${entry.name}" exceeds the maximum 10 MB size limit.` };
      }
      const arrayBuffer = await entry.arrayBuffer();
      attachments.push({
        filename: entry.name,
        content: Buffer.from(arrayBuffer),
        contentType: entry.type || "application/octet-stream",
      });
    }
  }

  const result = await contactParty(
    resolver,
    partyId,
    sendEmailViaResend,
    message,
    {
      subject,
      templateKey,
      templateCategory,
      cc: cc ? cc.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      attachments,
    },
  );

  if (!result.ok) {
    return { error: result.error };
  }

  return { ok: true };
}
