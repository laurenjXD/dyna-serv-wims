import type { Config } from "tailwindcss";

// Design tokens sourced from specs/00-steering/brand-design-system.md.
// Do not add ad-hoc hex values in components — every token lives here.
// Any new value must be added to brand-design-system.md first (see its §13 Governance).
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    // §3: mobile-first breakpoints. `base` (unprefixed) is 0-639px by definition —
    // Tailwind's default `sm/md/lg/xl` values already match brand-design-system.md §3 exactly.
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
    },
    extend: {
      colors: {
        // §1.1 Brand colors — "Steel & Hazard" (adopted 2026-08-12).
        // Both the 2026-08-10 indigo experiment and the 2026-08-11 navy/red
        // reversion are superseded — see specs/00-steering/revision-log.md.
        "brand-navy": "#1E293B", // slate-800, structural
        "brand-royal-blue": "#475569", // slate-600, secondary structural
        "brand-red": "#9A3412", // burnt safety-orange — accent/CTA only, never status. White-text contrast 7.31:1 (AAA), verified 2026-08-12 — see §1.1's note on why a brighter orange was tried and rejected.
        // §1.1a Accent scale — backgrounds/icons/active-states only, never
        // text color per §2's text-color rule. Aliases of the structural
        // slate values.
        "accent-indigo-50": "#F1F5F9",
        "accent-indigo-300": "#475569",
        "accent-indigo-600": "#1E293B",
        // §1.2 Neutrals
        "text-grey": "#475569",
        "surface-white": "#FFFFFF",
        "surface-light-grey": "#F8FAFC",
        "on-surface": "#0F172A",
        // outline-variant is always used at 30% opacity per §1.2 — consume as
        // `border-outline-variant/30`, never solid.
        "outline-variant": "#E2E8F0",
        // §1.3 Status colors (semantic — never conflate with brand-red).
        // Contrast-verified against on-surface (#0F172A) 2026-08-12:
        // available 7.04:1 (AAA), pending 9.31:1 (AAA), held 4.74:1 (AA —
        // see §1.5's note on this one known gap).
        "status-available": "#10B981",
        "status-pending": "#EAB308",
        "status-held": "#EF4444",
        "status-neutral": "#64748B",
      },
      fontFamily: {
        // §2 Typography — wired to next/font/google CSS variables in app/layout.tsx.
        // heading is Space Grotesk (headings/section titles only); body/label/
        // data-display stay on Inter.
        heading: ["var(--font-space-grotesk)", "sans-serif"], // headings only
        body: ["var(--font-inter)", "sans-serif"], // body copy, table cell content, data-display numbers
        label: ["var(--font-inter)", "sans-serif"], // nav items, badges, table headers, button labels
        mono: ["var(--font-jetbrains-mono)", "monospace"], // codes, IDs, lot numbers, numeric columns
      },
      fontSize: {
        // §2 Type scale — [fontSize, { lineHeight, letterSpacing }]
        "headline-xl": ["40px", { lineHeight: "48px", letterSpacing: "-0.02em" }],
        "headline-lg": ["32px", { lineHeight: "40px", letterSpacing: "normal" }],
        "headline-md": ["24px", { lineHeight: "32px", letterSpacing: "normal" }],
        "data-display": ["20px", { lineHeight: "24px", letterSpacing: "normal" }],
        "body-lg": ["18px", { lineHeight: "28px", letterSpacing: "normal" }],
        "body-md": ["16px", { lineHeight: "24px", letterSpacing: "normal" }],
        "body-sm": ["14px", { lineHeight: "20px", letterSpacing: "normal" }],
        label: ["14px", { lineHeight: "16px", letterSpacing: "0.03em" }],
        // mono is "context-dependent, 11-24px" per §2 — common sizes provided,
        // line-height fixed at the spec's documented 1.4x.
        "mono-sm": ["11px", { lineHeight: "15.4px", letterSpacing: "normal" }],
        "mono-md": ["14px", { lineHeight: "19.6px", letterSpacing: "normal" }],
        "mono-lg": ["18px", { lineHeight: "25.2px", letterSpacing: "normal" }],
        "mono-xl": ["24px", { lineHeight: "33.6px", letterSpacing: "normal" }],
      },
      spacing: {
        // §4 Spacing & Layout — base unit 8px, multiples of 8 throughout.
        "floor-padding": "16px", // floor screen page padding (not the office 32px default)
        "office-margin": "2rem", // 32px office page margin
        gutter: "1.5rem", // 24px office gutter
      },
      borderRadius: {
        // §5 Shape
        sm: "4px", // small pills, tags
        DEFAULT: "8px", // standard cards, buttons, inputs
        md: "12px", // larger cards, modals
        lg: "16px", // hero cards, feature panels
        full: "9999px", // status badges, avatar circles
      },
      maxWidth: {
        // §4: office container max-width
        container: "1280px",
      },
      boxShadow: {
        // §6 Elevation & Surfaces
        "elevation-1": "0 1px 2px rgba(15,23,42,0.08)", // office/desktop only, Level 1 cards/panels
        "elevation-2": "0 4px 16px rgba(15,23,42,0.12)", // modals, drawers, dropdowns; also the floor card default
      },
    },
  },
  plugins: [],
};

export default config;
