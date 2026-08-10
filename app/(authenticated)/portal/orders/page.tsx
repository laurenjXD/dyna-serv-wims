// `/portal/orders` — Party Portal: My Orders (read-only).
//
// Traceability:
//   specs/22-parties-portal/design.md §6 (Trading order/document history view),
//     §4 (authorization: pick_list.read, assigned_party scope), §8 (no offline).
//   specs/22-parties-portal/requirements.md R3 (scoped pick_lists read),
//     R3.3 (snapshot fields only — no live lots join), R3.4 (margin/cost
//     fields are NEVER selected or rendered in any query).
//   specs/22-parties-portal/tasks.md Task 4 (Trading order/document history).
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation),
//     §2 (typography), §9 (office table pattern, Roboto Mono for codes).
//
// Surface: Party (office-style glassmorphism per design.md §3.3).
// Capability gate: pick_list.read.
//   NOTE: party users hold pick_list.read with assigned_party scope; full
//   scope resolution (Task 2) pending — requirePermission called without scope.
// Offline: no offline caching (design.md Task 8, requirements.md R8).
// Pricing: Trading prices shown on pick list items are FINAL (brand-design-system.md
//   "Trading/3PL" note). Margin, buying_price, and cost fields are NEVER
//   rendered — requirements.md R3.4, tasks.md Task 4 query-shape assertion.
//
// TODO: wire to pick_lists scoped to session party via
//   can_access_party_resource('pick_list', 'read', customer_party_id, flow_type)
//   RLS pattern (resource key is 'pick_list' singular per tasks.md Task 4).

import Link from "next/link";
import { ListChecks, FileText } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = "committed" | "dispatched";

interface OrderRow {
  id: string;
  pickListNumber: string;
  date: string;
  itemsCount: number;
  status: OrderStatus;
  documentId: string | null;
}

// ─── Status helpers — tokens from tailwind.config.ts, no raw hex ──────────────
// brand-design-system.md §1.3:
//   committed  → status-pending (amber) — in progress
//   dispatched → status-available (green) — fulfilled

const STATUS_CLASSES: Record<OrderStatus, string> = {
  committed: "bg-status-pending/10 text-status-pending",
  dispatched: "bg-status-available/10 text-status-available",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  committed: "COMMITTED",
  dispatched: "DISPATCHED",
};

// ─── Mock data ────────────────────────────────────────────────────────────────
// TODO: replace with real pick_lists query scoped to session party.
// ASSERT: margin, buying_price, selling_price, and inventory_commitments are
//   NEVER queried or rendered from this view (requirements.md R3.4,
//   tasks.md Task 4). Items sourced from snapshot fields only — no live lots join.

const MOCK_ORDERS: OrderRow[] = [
  {
    id: "order-001",
    pickListNumber: "PL-2026-011",
    date: "2026-08-07",
    itemsCount: 4,
    status: "dispatched",
    documentId: "pl-doc-011",
  },
  {
    id: "order-002",
    pickListNumber: "PL-2026-019",
    date: "2026-08-08",
    itemsCount: 7,
    status: "committed",
    documentId: null,
  },
  {
    id: "order-003",
    pickListNumber: "PL-2026-023",
    date: "2026-08-09",
    itemsCount: 2,
    status: "committed",
    documentId: null,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PortalOrdersPage() {
  const resolver = await createPageResolver();
  // TODO: once Task 2 party-scope resolution is built, pass scope:
  //   { partyId: sessionPartyId, flowType: sessionFlowType }
  const permResult = await requirePermission(resolver, "pick_list.read");

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <ListChecks
          size={40}
          className="mx-auto mb-3 text-text-grey"
          aria-hidden="true"
        />
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view orders.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">pick_list.read</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-container">
      {/* Page header — Fira Sans Bold headline-xl per §2 */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          My Orders
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Your pick lists and order history. All data scoped to your account.
        </p>
      </div>

      {/* ── Orders table — Level 1 glassmorphism (office/party surface) ──────
          Epilogue SemiBold uppercase headers, Outfit Regular body,
          Roboto Mono for codes per §9. */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {MOCK_ORDERS.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <ListChecks
              size={40}
              className="text-text-grey"
              aria-hidden="true"
            />
            <p className="font-body text-body-md text-text-grey">
              No orders found.
            </p>
            <p className="font-body text-body-sm text-text-grey">
              Orders appear here once pick lists have been committed for your
              account.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Pick List #
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Items
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                  <th className="sr-only px-4 py-3">Documents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {MOCK_ORDERS.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-surface-light-grey/50"
                  >
                    {/* Pick list number — Roboto Mono for codes per §9 */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {order.pickListNumber}
                    </td>
                    {/* Date — body text */}
                    <td className="px-4 py-3 font-body text-body-md text-text-grey">
                      {order.date}
                    </td>
                    {/* Items count — Roboto Mono for numeric columns */}
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {order.itemsCount}
                    </td>
                    {/* Status badge — §1.3 semantic colors */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${STATUS_CLASSES[order.status]}`}
                      >
                        {STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    {/* Documents link — only shown when dispatched and document exists */}
                    <td className="px-4 py-3 text-right">
                      {order.documentId ? (
                        <Link
                          href={`/portal/documents?ref=${order.documentId}`}
                          className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97]"
                        >
                          <FileText size={16} aria-hidden="true" />
                          Documents
                        </Link>
                      ) : (
                        <span className="font-body text-body-sm text-text-grey">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trading price note — PRODUCT/2026-08-09: Trading prices shown on
          pick list documents are FINAL. No price/cost columns are rendered
          in this orders table — prices live in the document view only. */}
    </div>
  );
}
