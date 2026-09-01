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

// ---------------------------------------------------------------------------
// createPartyAction
// ---------------------------------------------------------------------------

export async function createPartyAction(
  _prevState: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const resolver = await createPageResolver();

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
    notes: nullableString(formData.get("notes")),
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
    notes: nullableString(formData.get("notes")),
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

// ---------------------------------------------------------------------------
// contactPartyAction
// ---------------------------------------------------------------------------

async function sendEmailViaResend(
  payload: ContactPartyEmailPayload,
): Promise<void> {
  // Minimal Resend integration using 04-services-and-infrastructure's pipeline.
  // The template_key and resource_type follow the email_deliveries contract
  // (design.md §5a step 4). Failures are caught by the callee (contactParty)
  // per the fail-open rule (design.md §5a step 5).
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from =
    process.env.RESEND_FROM_OPERATIONS ?? "noreply@example.com";

  await resend.emails.send({
    from,
    to: [payload.recipientEmail],
    subject: "Message from Dyna-Serv Operations",
    html: [
      payload.recipientName
        ? `<p>Dear ${payload.recipientName},</p>`
        : "<p>Dear Valued Partner,</p>",
      "<p>You have received a notification from Dyna-Serv Warehouse Operations.</p>",
      payload.optionalMessage
        ? `<p>${payload.optionalMessage}</p>`
        : "",
      "<p>Regards,<br/>Dyna-Serv Operations Team</p>",
    ].join(""),
  });
}

export async function contactPartyAction(
  _prevState: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const resolver = await createPageResolver();
  const partyId = formData.get("partyId") as string;
  const message = nullableString(formData.get("message"));

  const result = await contactParty(
    resolver,
    partyId,
    sendEmailViaResend,
    message,
  );

  if (!result.ok) {
    return { error: result.error };
  }

  return { ok: true };
}
