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

const SETTINGS_NAV_ITEMS = [
  { id: "general", label: "General", href: "/settings/general" },
  { id: "team", label: "Team & Dynamic RBAC", href: "/settings/team" },
  { id: "security", label: "Security", href: "/settings/security" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings"
      data-testid="settings-nav"
      className="flex min-w-0 max-w-full gap-7 overflow-x-auto border-b border-slate-200/80 bg-transparent px-1"
    >
      {SETTINGS_NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.id}
            href={item.href}
            data-testid={`settings-nav-${item.id}`}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex min-h-16 shrink-0 items-center whitespace-nowrap px-1 font-heading text-base font-bold tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy sm:text-lg ${
              isActive ? "text-slate-950" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {item.label}
            {isActive && <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-navy" />}
          </Link>
        );
      })}
    </nav>
  );
}
