"use server";

import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { seedSampleData } from "@/lib/actions/sample-data";

export type SampleDataState =
  { ok: true; message: string } | { ok: false; error: string } | null;

export async function addSampleData(
  _previousState: SampleDataState,
  _formData: FormData,
): Promise<SampleDataState> {
  const result = await seedSampleData(await createPageResolver());
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/enrollment");
  revalidatePath("/receiving");
  revalidatePath("/inventory");

  const { organizations, items, wrrs } = result.created;
  const added = organizations + items + wrrs;
  return {
    ok: true,
    message:
      added === 0
        ? "The three sample organizations, items, and WRRs are ready. Existing sample items were refreshed."
        : `Sample data ready: added ${organizations} organization(s), ${items} item(s), and ${wrrs} WRR(s).`,
  };
}
