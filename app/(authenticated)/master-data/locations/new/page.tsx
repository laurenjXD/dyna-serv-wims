// Location create page — requires locations.manage (Administrator only).

import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { listLocations } from "@/lib/db/queries/locations";
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

  const { rows } = await listLocations(db, { limit: 5000, offset: 0 });
  const suggestions = {
    zones: [...new Set(rows.map((row) => row.zone))].sort(),
    racks: [...new Set(rows.map((row) => row.rack))].sort(),
    levels: [...new Set(rows.map((row) => row.level))].sort(),
    positions: [...new Set(rows.map((row) => row.position))].sort(),
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          New Location
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Enroll a new physical storage or staging location. The location label
          is computed by the server from rack, level, and position.
        </p>
      </div>

      <div className="rounded-xl bg-surface-white shadow-elevation-1 p-6">
        <LocationForm
          action={createLocationAction}
          suggestions={suggestions}
          cancelHref="/enrollment?tab=locations"
        />
      </div>
    </div>
  );
}
