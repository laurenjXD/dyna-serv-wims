import type { Config } from "tailwindcss";

// Design tokens sourced from specs/00-steering/design.md and ui-ux-design-plan.md.
// Do not add ad-hoc hex values in components — every token lives here.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
    },
    extend: {
      colors: {
        // Unified UI/UX Visual Design System Palette (specs/00-steering/design.md)
        primary: "#2563EB",         // 🔵 Vibrant Blue
        "primary-hover": "#1E3A8A", // 🔵 Deep Blue
        secondary: "#7C3AED",       // 🟣 Violet
        neutral: "#94A3B8",         // ◻️ Cool Gray
        background: "#F3F6FC",      // Cool blue-gray application canvas
        surface: "#FFFFFF",         // ⬜ Solid White (Level 1)
        "text-primary": "#0F172A",  // 🌑 Deep Navy
        "text-secondary": "#64748B",// 🩶 Slate
        border: "#E2E8F0",          // ◽ Light Blue-Gray
        success: "#10B981",         // 🟢 Emerald
        warning: "#F59E0B",         // 🟠 Amber
        error: "#EF4444",           // 🔴 Red

        // Legacy compatibility aliases mapped to unified design tokens
        "brand-navy": "#0F172A",
        "brand-blue": "#2563EB",
        "brand-blue-dark": "#1E3A8A",
        "brand-royal-blue": "#2563EB",
        "brand-red": "#EF4444",
        "accent-indigo-50": "#EEF3FF",
        "accent-indigo-300": "#2563EB",
        "accent-indigo-600": "#1E3A8A",
        "text-grey": "#64748B",
        "surface-white": "#FFFFFF",
        "surface-light-grey": "#F3F6FC",
        "on-surface": "#0F172A",
        "outline-variant": "#E2E8F0",
        "status-available": "#10B981",
        "status-pending": "#F59E0B",
        "status-held": "#EF4444",
        "status-neutral": "#64748B",
      },
      fontFamily: {
        // Typography System (specs/00-steering/design.md)
        // DM Sans (headings/displays) + Glacial Indifference (body/UI/nav/badges/buttons)
        heading: ["var(--font-dm-sans)", "sans-serif"],
        body: ["var(--font-glacial)", "sans-serif"],
        label: ["var(--font-glacial)", "sans-serif"],
        mono: ["var(--font-glacial)", "sans-serif"],
      },
      fontSize: {
        // Type scale (specs/00-steering/design.md §7)
        "headline-xl": ["40px", { lineHeight: "48px", letterSpacing: "-0.02em" }],
        "headline-lg": ["32px", { lineHeight: "40px", letterSpacing: "normal" }],
        "headline-md": ["24px", { lineHeight: "32px", letterSpacing: "normal" }],
        "data-display": ["20px", { lineHeight: "24px", letterSpacing: "normal" }],
        "body-lg": ["18px", { lineHeight: "28px", letterSpacing: "normal" }],
        "body-md": ["16px", { lineHeight: "24px", letterSpacing: "normal" }],
        "body-sm": ["14px", { lineHeight: "20px", letterSpacing: "normal" }],
        label: ["14px", { lineHeight: "16px", letterSpacing: "0.03em" }],
        "mono-sm": ["14px", { lineHeight: "20px", letterSpacing: "normal" }],
        "mono-md": ["16px", { lineHeight: "24px", letterSpacing: "normal" }],
        "mono-lg": ["18px", { lineHeight: "28px", letterSpacing: "normal" }],
        "mono-xl": ["24px", { lineHeight: "32px", letterSpacing: "normal" }],
      },
      spacing: {
        "floor-padding": "16px",
        "office-margin": "32px",
        gutter: "24px",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",
        md: "12px",
        lg: "16px",
        // 2026-08-19: bento-box card/navbar/sidebar rounding, per user
        // request and per page specs.md §2's "Floating Header (radius-full)
        // / Floating Sidebar (radius-xl)" description — previously never
        // implemented anywhere (see revision-log.md's "Mega-Card" doc-drift
        // entry for the earlier phased-rollout decision this supersedes).
        xl: "24px",
        full: "9999px",
      },
      maxWidth: {
        container: "1280px",
      },
      boxShadow: {
        "elevation-1": "0 1px 2px rgba(15,23,42,0.08)",
        "elevation-2": "0 4px 16px rgba(15,23,42,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
