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
        // Dyna-Serv Brand Guidelines (rev. August 2026)
        primary: "#2563EB",         // Vibrant Blue
        "primary-hover": "#1E3A8A", // Deep Blue
        secondary: "#7C3AED",       // Violet
        neutral: "#94A3B8",          // Cool Gray
        background: "#FFF7ED",       // Cream White application canvas
        surface: "#FFFFFF",         // ⬜ Solid White (Level 1)
        "text-primary": "#0F172A", // Deep Navy body and primary reading text
        "text-secondary": "#64748B", // Slate secondary copy and helper text
        heading: "#0F172A",        // Deep Navy heading emphasis
        border: "#E2E8F0",          // Hairline border
        success: "#10B981",         // 🟢 Emerald
        warning: "#F59E0B",         // 🟠 Amber
        error: "#EF4444",           // Red

        // Legacy compatibility aliases mapped to unified design tokens
        "brand-navy": "#0F172A",
        "brand-blue": "#2563EB",
        "brand-blue-dark": "#1E3A8A",
        "brand-royal-blue": "#2563EB",
        "brand-red": "#EF4444",
        "accent-indigo-50": "#FFF7ED",
        "accent-indigo-300": "#2563EB",
        "accent-indigo-600": "#1E3A8A",
        "text-grey": "#64748B",
        "surface-white": "#FFFFFF",
        "surface-light-grey": "#FFF7ED",
        "on-surface": "#0F172A",
        "outline-variant": "#E2E8F0",
        "status-available": "#10B981",
        "status-pending": "#F59E0B",
        "status-held": "#D40007",
        "status-neutral": "#66789A",
      },
      fontFamily: {
        // Dyna-Serv Brand Guidelines: Avenir Next / Inter / JetBrains Mono.
        heading: ["Etna Sans Serif", "DM Sans", "Avenir Next", "sans-serif"],
        body: ["Glacial Indifference", "Inter", "Helvetica Neue", "Arial", "sans-serif"],
        label: ["Glacial Indifference", "Inter", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // Type scale (specs/00-steering/design.md §7)
        "headline-xl": ["44px", { lineHeight: "52px", letterSpacing: "-0.02em" }],
        "headline-lg": ["24px", { lineHeight: "32px", letterSpacing: "normal" }],
        "headline-md": ["24px", { lineHeight: "32px", letterSpacing: "normal" }],
        "headline-sm": ["20px", { lineHeight: "28px", letterSpacing: "normal" }],
        // Compatibility aliases used by older page components. They resolve
        // to the same approved brand scale rather than browser defaults.
        "title-xl": ["44px", { lineHeight: "52px", letterSpacing: "-0.02em" }],
        "title-lg": ["24px", { lineHeight: "32px", letterSpacing: "normal" }],
        "title-md": ["24px", { lineHeight: "32px", letterSpacing: "normal" }],
        "title-sm": ["20px", { lineHeight: "28px", letterSpacing: "normal" }],
        "heading-lg": ["24px", { lineHeight: "32px", letterSpacing: "normal" }],
        "heading-md": ["24px", { lineHeight: "32px", letterSpacing: "normal" }],
        "data-display": ["20px", { lineHeight: "24px", letterSpacing: "normal" }],
        "body-lg": ["18px", { lineHeight: "28px", letterSpacing: "normal" }],
        "body-md": ["16px", { lineHeight: "24px", letterSpacing: "normal" }],
        "body-sm": ["14px", { lineHeight: "20px", letterSpacing: "normal" }],
        "body-xs": ["12px", { lineHeight: "16px", letterSpacing: "normal" }],
        label: ["14px", { lineHeight: "20px", letterSpacing: "normal" }],
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
        sm: "6px",
        DEFAULT: "8px",
        md: "10px",
        lg: "12px",
        xl: "12px",
        "2xl": "12px",
        full: "9999px",
      },
      maxWidth: {
        container: "1280px",
      },
      boxShadow: {
        "elevation-1": "0 1px 2px rgba(15,23,42,0.08)",
        "elevation-2": "0 4px 16px rgba(15,23,42,0.12)",
      },
      gridTemplateColumns: {
        "31": "repeat(31, minmax(0, 1fr))",
      },
    },
  },
  plugins: [],
};

export default config;
