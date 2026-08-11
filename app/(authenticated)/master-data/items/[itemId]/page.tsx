// Item detail page.
//
// Traceability: specs/06-party-and-item-enrollment/design.md §6

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { getItem } from "@/lib/db/queries/items";
import { DeactivateItemSection } from "../_components/item-deactivate";

interface PageProps {
  params: Promise<{ itemId: string }>;
}

export default async function ItemDetailPage({ params }: PageProps) {
  const { itemId } = await params;
  const resolver = await createPageResolver();

  const readPerm = await requirePermission(resolver, "items.read");
  if (readPerm.kind !== "authorized") {
    notFound();
  }

  const [item, canManage] = await Promise.all([
    getItem(db, itemId),
    requirePermission(resolver, "items.manage").then(
      (r) => r.kind === "authorized",
    ),
  ]);

  if (!item) notFound();

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav className="mb-2" aria-label="Breadcrumb">
            <ol className="flex items-center gap-1 font-body text-body-sm text-on-surface-variant">
              <li>
                <Link href="/master-data/items" className="inline-flex h-11 items-center rounded hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary">
                  Items
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-on-surface">
                {item.name}
              </li>
            </ol>
          </nav>
          <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
            {item.name}
          </h1>
          <p className="mt-1 font-mono text-mono-md text-on-surface-variant">
            {item.code}
          </p>
        </div>
        {canManage && (
          <Link
            href={`/master-data/items/${itemId}/edit`}
            className="flex h-11 items-center justify-center rounded bg-primary px-4 font-label text-label text-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-action-blue"
          >
            Edit
          </Link>
        )}
      </div>

      <div className="mt-4">
        {item.isActive ? (
          <span className="inline-flex items-center rounded-full bg-status-success/10 px-3 py-1 font-label text-label text-status-success">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-status-neutral/10 px-3 py-1 font-label text-label text-status-neutral">
            Inactive
          </span>
        )}
      </div>

      {/* Core identifiers */}
      <div className="mt-6 rounded-md bg-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Item Information
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="font-label text-label text-on-surface-variant">Barcode</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.barcode}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">Item Type</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface capitalize">
              {item.itemType.replace(/_/g, " ")}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">UOM</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface uppercase">
              {item.uom}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">Currency</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {item.currency}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">SPQ</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.spq}
            </dd>
          </div>
          {item.spqMeter && (
            <div>
              <dt className="font-label text-label text-on-surface-variant">
                SPQ Meter
              </dt>
              <dd className="mt-1 font-mono text-mono-md text-on-surface">
                {item.spqMeter} m
              </dd>
            </div>
          )}
          <div>
            <dt className="font-label text-label text-on-surface-variant">
              Supplier Item Code
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.supplierItemCode ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">
              Customer Item Code
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.customerItemCode ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">
              DSGC Item Number
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.dsgcItemNumber ?? "—"}
            </dd>
          </div>
          {item.description && (
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="font-label text-label text-on-surface-variant">
                Description
              </dt>
              <dd className="mt-1 font-body text-body-md text-on-surface">
                {item.description}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Dimensions and volume */}
      <div className="mt-6 rounded-md bg-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Dimensions &amp; Volume
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-label text-label text-on-surface-variant">Length</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.lengthCm ? `${item.lengthCm} cm` : "—"}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">Width</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.widthCm ? `${item.widthCm} cm` : "—"}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">Height</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.heightCm ? `${item.heightCm} cm` : "—"}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">
              Volume CBM
            </dt>
            <dd className="mt-1 font-mono text-mono-md font-bold text-on-surface">
              {item.volumeCbm} m³
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">Weight</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.weightKg ? `${item.weightKg} kg` : "—"}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">
              Boxes per Pallet
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.boxesPerPallet ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">
              Min Reorder Level
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.minReorderLevel}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">
              Perishable
            </dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {item.isPerishable ? "Yes" : "No"}
            </dd>
          </div>
        </dl>
      </div>

      {/* Deactivation zone */}
      {canManage && item.isActive && (
        <div className="mt-6 rounded-md bg-white shadow-elevation-1 p-6">
          <h2 className="font-heading font-semibold text-data-display text-on-surface">
            Danger Zone
          </h2>
          <p className="mt-1 font-body text-body-sm text-on-surface-variant">
            Deactivating an item prevents it from being selected in new
            transactions. Existing linked records are not deleted.
          </p>
          <div className="mt-4">
            <DeactivateItemSection itemId={itemId} />
          </div>
        </div>
      )}

      {/* Reference prices — clearly labelled as non-final */}
      <div className="mt-6 rounded-md bg-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Reference Prices
        </h2>
        <div className="mt-2 rounded border border-status-warning/30 bg-status-warning/5 px-4 py-2">
          <p className="font-body text-body-sm text-on-surface">
            Reference values only — do not determine any Trading document price
            or VMI billing amount.
          </p>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-label text-label text-on-surface-variant">
              Buying Price ({item.currency})
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.buyingPrice ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">
              Selling Price ({item.currency})
            </dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {item.sellingPrice ?? "—"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
