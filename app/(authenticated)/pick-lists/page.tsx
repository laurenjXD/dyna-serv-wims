// Pick Lists — dedicated operational queue for committed outbound work.
//
// The Stock View on /inventory remains the authoritative generation surface.
// This index provides a read-only document queue and hands staff into the
// direct dispatch flow without duplicating allocation or commitment logic.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { db } from "@/lib/db/client";
import { listPickLists, type PickListRow } from "@/lib/db/queries/withdrawals";
import { requirePermission } from "@/lib/rbac/guard";
import { deletePickList } from "./_actions";

const STATUS_CLASSES: Record<string, string> = {
  allocated: "bg-status-pending/15 text-status-pending",
  picked: "bg-brand-navy/15 text-brand-navy",
  dispatched: "bg-status-available/15 text-status-available",
};

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

function statusLabel(status: string) {
  return status.replace(/_/g, " ").toUpperCase();
}

function PickListAction({ row, canExecute: _canExecute, deleted }: { row: PickListRow; canExecute: boolean; deleted?: boolean }) {
  if (deleted) return <span className="font-body text-body-sm text-text-grey">Deleted</span>;

  return (
    <div className="flex justify-end">
      <Link
        href={`/pick-lists/${row.id}/dispatch`}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/50 bg-surface-white px-4 font-label text-body-sm font-semibold text-on-surface shadow-sm hover:bg-surface-light-grey hover:border-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
      >
        Actions &rarr;
      </Link>
    </div>
  );
}

import { PickListsFilterableTable } from "./_components/PickListsFilterableTable";

export default async function PickListsIndexPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "pick_list.read");

  if (permission.kind !== "authorized") {
    notFound();
  }

  const canExecute =
    (await requirePermission(resolver, "pick_list.execute")).kind === "authorized";
  const { tab } = await searchParams;
  const isDeleted = tab === "deleted";
  const { rows, total } = await listPickLists(db, { limit: 50, offset: 0, deleted: isDeleted });

  return (
    <div className="mx-auto max-w-container">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-headline-md font-extrabold text-on-surface">
            Pick Lists
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Review committed outbound work and open the PDF or direct dispatch flow.
          </p>
        </div>
        <Link
          href="/inventory"
          className="inline-flex min-h-11 items-center justify-center rounded border border-outline-variant/30 bg-surface-white px-4 font-label text-label font-semibold text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        >
          Stock View
        </Link>
      </div>

      <nav className="mt-6 flex gap-1 border-b border-outline-variant/30" aria-label="Pick list views">
        <Link href="/pick-lists" className={`border-b-2 px-4 py-3 font-label text-label font-bold ${!isDeleted ? "border-brand-primary text-brand-primary" : "border-transparent text-text-grey"}`}>Open</Link>
        <Link href="/pick-lists?tab=deleted" className={`border-b-2 px-4 py-3 font-label text-label font-bold ${isDeleted ? "border-brand-primary text-brand-primary" : "border-transparent text-text-grey"}`}>Deleted</Link>
      </nav>

      <div className="mt-6">
        <PickListsFilterableTable
          rows={rows}
          total={total}
          canExecute={canExecute}
          isDeleted={isDeleted}
        />
      </div>
    </div>
  );
}
