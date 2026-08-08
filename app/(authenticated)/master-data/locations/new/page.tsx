// Location create page — requires locations.manage (Administrator only).

import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { LocationForm } from "../_components/location-form";
import { createLocationAction } from "../_actions";

export default async function NewLocationPage() {
  const resolver = await createPageResolver();
  const perm = await requirePermission(resolver, "locations.manage");

  if (perm.kind !== "authorized") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
          New Location
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Enroll a new physical storage or staging location. The location label
          is computed by the server from rack, level, and position.
        </p>
      </div>

      <div className="rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1 p-6">
        <LocationForm
          action={createLocationAction}
          cancelHref="/master-data/locations"
        />
      </div>
    </div>
  );
}
