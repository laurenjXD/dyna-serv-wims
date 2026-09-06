// Secondary left-rail settings navigation — Team Members / Security /
// General.
//
// Traceability: specs/21-user-profile-and-settings/design.md §1.2 ("The
// settings area requires deeper navigation... employ a secondary left-rail
// navigation pattern inside the main app shell") and tasks.md Task 21.5.
//
// Office surface throughout (44px touch targets, hover states) — /settings
// is registered `surface: "office"` in lib/shell/registry.ts, administrator-
// only per 05's route catalog. This does NOT extend to /profile: that route
// is `surface: "shared"` and was rebuilt to floor defaults (2026-08-08,
// see 21-user-profile-and-settings/design.md §1.1's amendment) after a
// design-system-auditor finding that an earlier build wrongly styled it
// office-only. SettingsNav only ever renders on /settings, so this file
// itself is unaffected — noted here only so a future reader doesn't infer
// /profile is still office-styled from this comment's earlier wording.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ShieldCheck, SlidersHorizontal, UsersRound } from "lucide-react";

const SETTINGS_NAV_ITEMS = [
  {
    id: "general",
    label: "General",
    description: "Facility and scanner defaults",
    href: "/settings/general",
    Icon: Building2,
  },
  {
    id: "team",
    label: "Team & RBAC",
    description: "Operators, roles, and access",
    href: "/settings/team",
    Icon: UsersRound,
  },
  {
    id: "security",
    label: "Security",
    description: "Sessions and governance",
    href: "/settings/security",
    Icon: ShieldCheck,
  },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <aside className="shrink-0 md:w-64">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <div className="hidden border-b border-slate-100 px-5 py-5 md:block">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-white shadow-sm">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Workspace settings
          </p>
          <p className="mt-1 font-heading text-base font-bold text-slate-900">
            Configure WIMS
          </p>
          <p className="mt-1 font-body text-xs leading-5 text-slate-500">
            Manage your facility, team, and security controls.
          </p>
        </div>

        <nav
          aria-label="Settings"
          data-testid="settings-nav"
          className="flex flex-row gap-1 overflow-x-auto p-2 md:flex-col md:gap-1.5 md:p-3"
        >
          {SETTINGS_NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.Icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                data-testid={`settings-nav-${item.id}`}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex min-h-12 shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy md:w-full ${
                  isActive
                    ? "bg-brand-navy text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isActive
                      ? "bg-white/15 text-white"
                      : "bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-brand-navy"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 md:block">
                  <span className="block whitespace-nowrap font-label text-xs font-bold uppercase tracking-wide">
                    {item.label}
                  </span>
                  <span
                    className={`mt-0.5 hidden truncate font-body text-[11px] md:block ${
                      isActive ? "text-blue-100" : "text-slate-400"
                    }`}
                  >
                    {item.description}
                  </span>
                </span>
                {isActive && (
                  <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-blue-200 md:block" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
