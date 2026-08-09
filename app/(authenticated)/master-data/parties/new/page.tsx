// Party create page — requires parties.manage.

import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { PartyForm } from "../_components/party-form";
import { createPartyAction } from "../_actions";

export default async function NewPartyPage() {
  const resolver = await createPageResolver();
  const perm = await requirePermission(resolver, "parties.manage");

  if (perm.kind !== "authorized") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
          New Party
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Enroll a new vendor, supplier, customer, or other business party.
        </p>
      </div>

      <div className="rounded-md bg-surface-white shadow-elevation-1 p-6">
        <PartyForm
          action={createPartyAction}
          cancelHref="/master-data/parties"
        />
      </div>
    </div>
  );
}
