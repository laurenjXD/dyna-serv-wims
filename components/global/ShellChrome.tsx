"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { resolveSessionPresentationTier } from "@/lib/shell/surface";
import { useShellAuthorizationContext } from "./AuthenticatedShellBoundary";
import { ShellNavigation } from "./ShellNavigation";

export function ShellChrome({ children }: { children: ReactNode }) {
  const context = useShellAuthorizationContext();
  const pathname = usePathname();

  const tier = resolveSessionPresentationTier(context?.activeRoleKeys ?? []);
  const pageTitle = getPageTitle(pathname);

  // We only use the profile image as a placeholder like the Stitch design.
  const profileImg = "https://lh3.googleusercontent.com/aida-public/AB6AXuCn0x5KZZh2cA4tLyhYvD4p0Trg9-Iu9c6ZBHTzh1PfMfE_lls7ZBvkyFiH4-DbfwyWzAxCoSioAX0VD6Gn2YCTwUpvvzN60bMSa_srcdXLNOdLSM4PCV8jM7FUUETjvc8uBnYkJbGDDdmzsQQOOTp661Sv6rNOo78a_kvyBen2SlP2AzFPjLEyb5Y2mkKPJ8HcHUcZVSxtq6Mi0Jy7AVHAuC7t6VkVj0n76zXhtuOXmcZWJZZ6VTU";

  return (
    <div className="h-full flex flex-col md:flex-row bg-surface text-on-surface">
      
      {/* Mobile Top Header (only visible on md:hidden) */}
      <header className="md:hidden bg-surface border-b border-outline-variant px-margin-mobile py-sm flex justify-between items-center sticky top-0 z-40 shadow-sm">
         <div className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-primary">{pageTitle}</div>
         <img src={profileImg} alt="User profile" className="w-10 h-10 rounded-full border border-outline-variant object-cover" />
      </header>

      {/* Nav renders both Desktop SideNav (md:flex) and Mobile BottomNav (md:hidden) */}
      <ShellNavigation tier={tier} context={{ grants: context?.grants ?? [] }} currentPath={pathname} />

      {/* Main Content Area */}
      <main id="main-content" data-surface={tier} className="flex-1 overflow-y-auto md:ml-64 md:h-screen md:bg-surface">
        
        {/* Desktop TopAppBar */}
        <header className="hidden md:flex fixed top-0 w-[calc(100%-16rem)] z-30 justify-between items-center px-margin-desktop h-16 bg-surface border-b border-outline-variant">
          <div className="font-headline-md text-headline-md font-bold text-primary truncate">{pageTitle}</div>
          <div className="flex items-center gap-md">
            <button className="p-sm text-on-surface-variant hover:bg-surface-container-high rounded-full transition-colors duration-200">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="p-sm text-on-surface-variant hover:bg-surface-container-high rounded-full transition-colors duration-200">
              <span className="material-symbols-outlined">settings</span>
            </button>
            <img src={profileImg} alt="User profile" className="w-8 h-8 rounded-full ml-sm object-cover" />
          </div>
        </header>

        {/* Content Container */}
        <div className="md:pt-24 md:px-margin-desktop md:pb-margin-desktop md:max-w-7xl md:mx-auto pt-md px-margin-mobile pb-24 flex flex-col gap-md md:gap-lg">
          {children}
        </div>
      </main>
      
      {/* Status region */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
    </div>
  );
}

function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Overview Hub";
  if (pathname.startsWith("/reports")) return "Reporting: Analytics";
  if (pathname.startsWith("/receiving")) return "Receiving / Incoming Hub";
  if (pathname.startsWith("/inventory")) return "Master Inventory Stock View";
  if (pathname.startsWith("/outgoing") || pathname.startsWith("/pick-lists")) return "Outgoing / Withdrawal Queue";
  if (pathname.startsWith("/transfers")) return "Transfers Hub";
  if (pathname.startsWith("/inspection")) return "Inspection";
  if (pathname.startsWith("/approvals")) return "Approval Queue";
  if (pathname.startsWith("/enrollment")) return "Enrollment";
  if (pathname.startsWith("/master-data/parties")) return "Master Data: Parties Enrollment";
  if (pathname.startsWith("/master-data/items")) return "Master Data: Items Enrollment";
  if (pathname.startsWith("/master-data/locations")) return "Master Data: Locations Enrollment";
  if (pathname.startsWith("/billing-pricing")) return "Reporting: Billing & Pricing";
  if (pathname.startsWith("/documents")) return "Documents";
  if (pathname.startsWith("/portal/inventory")) return "Party Portal: Inventory Position";
  if (pathname.startsWith("/portal/orders")) return "Party Portal: Order History";
  if (pathname.startsWith("/portal")) return "Party Portal: Home Hub";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/sync")) return "System: Sync Management";
  return "Dyna-Serv WIMS";
}
