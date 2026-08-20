// Party edit page — requires parties.manage.

import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { getPartyWithRoles } from "@/lib/db/queries/parties";
import { PartyForm } from "../../_components/party-form";
import { updatePartyAction } from "../../_actions";

interface PageProps {
  params: Promise<{ partyId: string }>;
}

export default async function EditPartyPage({ params }: PageProps) {
  const { partyId } = await params;
  const resolver = await createPageResolver();

  const perm = await requirePermission(resolver, "parties.manage");
  if (perm.kind !== "authorized") {
    notFound();
  }

  const party = await getPartyWithRoles(db, partyId);
  if (!party) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          Edit Organization
        </h1>
        <p className="mt-1 font-mono text-mono-md text-text-grey">
          {party.code} — {party.name}
        </p>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          To manage business roles, use the detail page.
        </p>
      </div>

      <div className="rounded-xl bg-surface-white shadow-elevation-1 p-6">
        <PartyForm
          action={updatePartyAction}
          party={party}
          cancelHref={`/master-data/parties/${partyId}`}
        />
      </div>
    </div>
  );
}
