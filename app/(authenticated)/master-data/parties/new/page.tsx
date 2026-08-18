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
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          New Organization
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Enroll a new vendor, supplier, customer, or other business organization.
        </p>
      </div>

      <div className="rounded-md bg-surface-white shadow-elevation-1 p-6">
        <PartyForm
          action={createPartyAction}
          cancelHref="/enrollment?tab=parties"
        />
      </div>
    </div>
  );
}
