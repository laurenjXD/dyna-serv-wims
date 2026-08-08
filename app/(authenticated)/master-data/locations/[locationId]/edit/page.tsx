// Location edit page — requires locations.manage (Administrator only).

import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { getLocation } from "@/lib/db/queries/locations";
import { LocationForm } from "../../_components/location-form";
import { updateLocationAction } from "../../_actions";

interface PageProps {
  params: Promise<{ locationId: string }>;
}

export default async function EditLocationPage({ params }: PageProps) {
  const { locationId } = await params;
  const resolver = await createPageResolver();

  const perm = await requirePermission(resolver, "locations.manage");
  if (perm.kind !== "authorized") {
    notFound();
  }

  const location = await getLocation(db, locationId);
  if (!location) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
          Edit Location
        </h1>
        <p className="mt-1 font-mono text-mono-md text-text-grey">
          {location.label}
        </p>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          Changing rack, level, or position will recompute the label
          server-side and validate its uniqueness before saving.
        </p>
      </div>

      <div className="rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
        <LocationForm
          action={updateLocationAction}
          location={location}
          cancelHref={`/master-data/locations/${locationId}`}
        />
      </div>
    </div>
  );
}
