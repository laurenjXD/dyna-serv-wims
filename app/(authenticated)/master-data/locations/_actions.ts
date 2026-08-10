"use server";

// Next.js 15 server action wrappers for location enrollment.
//
// Note: locations has no `updated_at` column in the approved 01 schema.
// The stale-edit token used by updateLocation is `created_at` (see
// lib/actions/locations.ts). The hidden field in the edit form is named
// "updatedAt" for API consistency, but its value is the created_at timestamp.
//
// Traceability:
//   lib/actions/locations.ts — pure action functions
//   specs/06-party-and-item-enrollment/design.md §6a

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { db as _db } from "@/lib/db/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = _db as unknown as { [key: string]: (...args: any[]) => any };
import {
  createLocation,
  updateLocation,
  deactivateLocation,
} from "@/lib/actions/locations";

// ---------------------------------------------------------------------------
// FormState
// ---------------------------------------------------------------------------

export type LocationFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  createdLabel?: string;
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
// createLocationAction
// ---------------------------------------------------------------------------

export async function createLocationAction(
  _prevState: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const resolver = await createPageResolver();

  const input = {
    zone: formData.get("zone"),
    rack: formData.get("rack"),
    level: formData.get("level"),
    position: formData.get("position"),
    locationType: formData.get("locationType") ?? "storage",
    maxCbmCapacity: nullableString(formData.get("maxCbmCapacity")) ?? "",
    isActive: formData.get("isActive") !== "false",
  };

  const result = await createLocation(resolver, input);

  if (!result.ok) {
    if ("fieldErrors" in result) {
      return { fieldErrors: result.fieldErrors };
    }
    return { error: result.error };
  }

  revalidatePath("/master-data/locations");
  redirect(`/master-data/locations/${result.data.id}`);
}

// ---------------------------------------------------------------------------
// updateLocationAction
// ---------------------------------------------------------------------------

export async function updateLocationAction(
  _prevState: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const resolver = await createPageResolver();

  const id = formData.get("id") as string;
  // The "updatedAt" field carries created_at value for locations (no updated_at column)
  const submittedUpdatedAt = formData.get("updatedAt") as string;

  const input = {
    zone: formData.get("zone"),
    rack: formData.get("rack"),
    level: formData.get("level"),
    position: formData.get("position"),
    locationType: formData.get("locationType") ?? "storage",
    maxCbmCapacity: nullableString(formData.get("maxCbmCapacity")) ?? "",
    isActive: formData.get("isActive") !== "false",
  };

  const result = await updateLocation(resolver, id, input, submittedUpdatedAt);

  if (!result.ok) {
    if ("fieldErrors" in result) {
      return { fieldErrors: result.fieldErrors };
    }
    if (result.error === "Conflict") {
      return {
        error:
          "This record was modified by someone else after you opened the form. Please reload to see the latest version before editing.",
      };
    }
    return { error: result.error };
  }

  revalidatePath("/master-data/locations");
  revalidatePath(`/master-data/locations/${id}`);
  redirect(`/master-data/locations/${id}`);
}

// ---------------------------------------------------------------------------
// deactivateLocationAction
// ---------------------------------------------------------------------------

export async function deactivateLocationAction(
  _prevState: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const resolver = await createPageResolver();
  const id = formData.get("id") as string;

  const result = await deactivateLocation(resolver, id);

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/master-data/locations");
  revalidatePath(`/master-data/locations/${id}`);
  return { ok: true };
}
