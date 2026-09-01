// Enrollment — tabbed master-data hub: Parties | Items | Locations.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §7 (list, search, pagination)
//   specs/00-steering/brand-design-system.md §3 (office tab pattern), §6
//     (office surface, Level 1 elevation)
//   lib/shell/registry.ts — id: "enrollment", surface: "office",
//     capability: "parties.read"
//   specs/00-steering/revision-log.md (2026-08-09 PO restructuring — new
//     /enrollment hub aggregates Parties / Items / Locations into one page)
//
// Surface: Office — desktop-first.
// Permission gate: parties.read — forbidden message (not notFound) if denied.
// Per-tab "New [Entity]" buttons are gated by the appropriate manage capability.
// Master Data routes:
//   /master-data/parties/new -> /master-data/parties/${party.id}
//   /master-data/items/new -> /master-data/items/${item.id}
//   /master-data/locations/new -> /master-data/locations/${loc.id}
// Office styling: bg-surface-white shadow-elevation-1

import Link from "next/link";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listParties } from "@/lib/db/queries/parties";
import type { PartyListRow } from "@/lib/db/queries/parties";
import { listItems } from "@/lib/db/queries/items";
import type { ItemListRow } from "@/lib/db/queries/items";
import { listLocations } from "@/lib/db/queries/locations";
import type { LocationListRow } from "@/lib/db/queries/locations";
import {
  OrganizationsEnrollmentTable,
  ItemsEnrollmentTable,
  LocationsEnrollmentTable,
} from "@/components/tables";

const PAGE_SIZE = 25;

type TabKey = "parties" | "items" | "locations";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "parties", label: "Organizations" },
  { key: "items", label: "Items" },
  { key: "locations", label: "Locations" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    search?: string;
    page?: string;
  }>;
}

export default async function EnrollmentPage({ searchParams }: PageProps) {
  const {
    tab: tabParam,
    search,
    page: pageParam,
  } = await searchParams;

  const activeTab: TabKey =
    tabParam === "items" ? "items" :
    tabParam === "locations" ? "locations" :
    "parties";

  const resolver = await createPageResolver();

  // Gate: parties.read required — show forbidden message (not 404) so the
  // route existence isn't hidden from users who simply lack the capability.
  const readResult = await requirePermission(resolver, "parties.read");
  if (readResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-4 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to access the Enrollment hub.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">parties.read</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10));
  const offset = (currentPage - 1) * PAGE_SIZE;
  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          Master Data Management
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Configure and manage core system entities.
        </p>
      </div>

      {/* Tab switcher — office pattern per brand-design-system.md §3 */}
      <div
        role="tablist"
        aria-label="Enrollment sections"
        className="mt-6 flex gap-2 border-b border-outline-variant/30"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const href =
            tab.key === "parties"
              ? "/enrollment"
              : tab.key === "items"
              ? "/enrollment?tab=items"
              : "/enrollment?tab=locations";
          return (
            <Link
              key={tab.key}
              href={href}
              role="tab"
              aria-selected={isActive}
              className={`flex h-11 items-center border-b-2 px-4 font-label text-label uppercase tracking-[0.05em] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                isActive
                  ? "border-on-surface text-on-surface"
                  : "border-transparent text-text-grey hover:text-on-surface"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {activeTab === "parties" ? (
        <PartiesTab
          resolver={resolver}
          search={search}
          currentPage={currentPage}
          offset={offset}
        />
      ) : activeTab === "items" ? (
        <ItemsTab
          resolver={resolver}
          search={search}
          currentPage={currentPage}
          offset={offset}
        />
      ) : (
        <LocationsTab
          resolver={resolver}
          search={search}
          currentPage={currentPage}
          offset={offset}
        />
      )}
    </div>
  );
}

// ─── Parties tab ──────────────────────────────────────────────────────────────
async function PartiesTab({
  resolver,
  search,
  currentPage,
  offset,
}: {
  resolver: Awaited<ReturnType<typeof createPageResolver>>;
  search?: string;
  currentPage: number;
  offset: number;
}) {
  const [canManage, { rows }] = await Promise.all([
    requirePermission(resolver, "parties.manage").then(
      (r) => r.kind === "authorized",
    ),
    listParties(db, { search, limit: PAGE_SIZE, offset }),
  ]);

  return (
    <div className="mt-4">
      <OrganizationsEnrollmentTable data={rows} canManage={canManage} />
    </div>
  );
}

// ─── Items tab ────────────────────────────────────────────────────────────────
async function ItemsTab({
  resolver,
  search,
  currentPage,
  offset,
}: {
  resolver: Awaited<ReturnType<typeof createPageResolver>>;
  search?: string;
  currentPage: number;
  offset: number;
}) {
  const [canManage, itemsReadResult] = await Promise.all([
    requirePermission(resolver, "items.manage").then(
      (r) => r.kind === "authorized",
    ),
    requirePermission(resolver, "items.read"),
  ]);

  if (itemsReadResult.kind !== "authorized") {
    return (
      <div className="mt-6 rounded-xl bg-surface-white shadow-elevation-1 px-6 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view items.
        </p>
      </div>
    );
  }

  const { rows } = await listItems(db, { search, limit: PAGE_SIZE, offset });

  return (
    <div className="mt-4">
      <ItemsEnrollmentTable data={rows} canManage={canManage} />
    </div>
  );
}

// ─── Locations tab ────────────────────────────────────────────────────────────
async function LocationsTab({
  resolver,
  search,
  currentPage,
  offset,
}: {
  resolver: Awaited<ReturnType<typeof createPageResolver>>;
  search?: string;
  currentPage: number;
  offset: number;
}) {
  const [canManage, locReadResult] = await Promise.all([
    requirePermission(resolver, "locations.manage").then(
      (r) => r.kind === "authorized",
    ),
    requirePermission(resolver, "locations.read"),
  ]);

  if (locReadResult.kind !== "authorized") {
    return (
      <div className="mt-6 rounded-xl bg-surface-white shadow-elevation-1 px-6 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view locations.
        </p>
      </div>
    );
  }

  const { rows } = await listLocations(db, { search, limit: PAGE_SIZE, offset });

  return (
    <div className="mt-4">
      <LocationsEnrollmentTable data={rows} canManage={canManage} />
    </div>
  );
}
