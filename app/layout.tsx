import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Co-locates every route's serverless function with the Supabase database
// (aws-0-ap-northeast-1 / Tokyo) instead of Vercel's iad1 (US East) default.
// Every authenticated page does at least one DB round trip (session/grants
// resolution via middleware + requirePermission()) plus its own queries —
// with compute and database on opposite sides of the Pacific, each of those
// paid a ~200ms+ one-way network cost before any actual query work started.
// See specs/00-steering/revision-log.md's "Vercel/Supabase region mismatch"
// entry (2026-08-17). Root-layout-level `preferredRegion` applies to every
// route unless a more specific segment overrides it (Next.js App Router
// convention on Vercel).
export const preferredRegion = "hnd1";

// Glacial Indifference (body/UI/nav/labels/badges/buttons) & Etna Sans
// Serif (headings/displays), per specs/00-steering/ui-ux-design-plan.md §7.
// Legacy Inter fallback retired now that real brand font files are in
// app/fonts/. Only one Etna weight file is currently supplied
// (etna-free-font.otf) — it backs both the 600 and 700 weight requests
// the design system calls for (Bold/SemiBold) until a dedicated SemiBold
// file is provided; the browser will not synthesize a second real weight
// from a single static face, so 600/700 currently render identically.
const fontGlacial = localFont({
  variable: "--font-glacial",
  src: [
    { path: "./fonts/GlacialIndifference-Regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/GlacialIndifference-Bold.otf", weight: "700", style: "normal" },
  ],
});

const fontEtna = localFont({
  variable: "--font-etna",
  src: [
    { path: "./fonts/etna-free-font.otf", weight: "600", style: "normal" },
    { path: "./fonts/etna-free-font.otf", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Dyna-Serv WIMS",
  description: "Dyna-Serv Warehouse Inventory Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${fontEtna.variable} ${fontGlacial.variable} font-body bg-background text-text-primary antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
