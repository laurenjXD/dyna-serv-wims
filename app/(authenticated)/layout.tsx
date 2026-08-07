// Authenticated shell layout for office/master-data surfaces.
//
// Implements the office-first layout per brand-design-system.md §3:
// desktop sidebar with brand-navy background, main content area with
// surface-light-grey background. Degrades to a top-nav on mobile as a
// working secondary case (spec §3: "office screens must remain usable
// down to mobile — a supervisor checking the queue from their phone is
// a real, secondary case, not an edge case to ignore").
//
// Traceability: specs/06-party-and-item-enrollment/design.md §3
// Styling: specs/00-steering/brand-design-system.md §1, §2, §3, §6

import Link from "next/link";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  {
    section: "Master Data",
    links: [
      { href: "/master-data/parties", label: "Parties" },
      { href: "/master-data/items", label: "Items" },
      { href: "/master-data/locations", label: "Locations" },
    ],
  },
];

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-surface-light-grey">
      {/* Sidebar — office/desktop only. brand-design-system.md §9 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-navy md:flex">
        {/* Logo / brand mark */}
        <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-6">
          <span className="font-heading font-bold text-headline-md text-surface-white tracking-tight">
            Dyna-Serv
          </span>
          <span className="ml-2 font-label text-label text-white/60">
            WIMS
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 py-6">
          {NAV_ITEMS.map((section) => (
            <div key={section.section} className="mb-6">
              <p className="mb-2 px-2 font-label text-label uppercase tracking-[0.05em] text-white/40">
                {section.section}
              </p>
              <ul className="space-y-0.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="flex h-11 items-center rounded px-3 font-label text-label text-white/70 transition-colors hover:bg-white/10 hover:text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-red"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 px-6 py-4">
          <p className="font-body text-body-sm text-white/40">
            Dyna-Serv WIMS v1
          </p>
        </div>
      </aside>

      {/* Mobile top nav — shown only below md breakpoint */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center border-b border-outline-variant/30 bg-brand-navy px-4 md:hidden">
        <span className="font-heading font-bold text-headline-md text-surface-white">
          Dyna-Serv
        </span>
        <span className="ml-2 font-label text-label text-white/60">WIMS</span>
        {/* Mobile nav links — condensed */}
        <nav className="ml-auto flex gap-4">
          <Link
            href="/master-data/parties"
            className="font-label text-label text-white/70 hover:text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-red rounded"
          >
            Parties
          </Link>
          <Link
            href="/master-data/items"
            className="font-label text-label text-white/70 hover:text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-red rounded"
          >
            Items
          </Link>
          <Link
            href="/master-data/locations"
            className="font-label text-label text-white/70 hover:text-surface-white focus:outline-none focus:ring-2 focus:ring-brand-red rounded"
          >
            Locations
          </Link>
        </nav>
      </header>

      {/* Main content — offset by sidebar on desktop, offset by top-nav on mobile */}
      <main className="flex-1 pt-14 md:ml-64 md:pt-0">
        <div className="min-h-screen px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
