// Bulk location generator page — requires locations.manage (Administrator only).
// Reached via a link from /enrollment's Locations tab (per page specs.md §8),
// not its own registry nav entry — same pattern as /master-data/locations/new.

import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { BulkLocationGeneratorForm } from "../_components/bulk-location-generator-form";
import { bulkGenerateLocationsAction } from "../_actions";

export default async function BulkGenerateLocationsPage() {
  const resolver = await createPageResolver();
  const perm = await requirePermission(resolver, "locations.manage");

  if (perm.kind !== "authorized") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          Bulk Generate Locations
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Generate a batch of locations from a naming-convention range
          (racks x levels x positions). Labels are computed the same way as
          the single-location form; existing labels are never duplicated.
        </p>
      </div>

      <div className="rounded-md bg-surface-white shadow-elevation-1 p-6">
        <BulkLocationGeneratorForm
          action={bulkGenerateLocationsAction}
          cancelHref="/enrollment?tab=locations"
        />
      </div>
    </div>
  );
}
