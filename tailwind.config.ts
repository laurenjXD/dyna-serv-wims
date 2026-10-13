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
        primary: "#0A2FAE",         // Dyna Blue
        "primary-hover": "#08248A", // Deep Blue
        secondary: "#071A63",       // Blue Ink
        neutral: "#8CA0E0",         // Muted label / mono text
        background: "#EEF2FF",      // Blue Tint application canvas
        surface: "#FFFFFF",         // ⬜ Solid White (Level 1)
        "text-primary": "#33414F", // Body and primary reading text
        "text-secondary": "#66789A", // Secondary copy and helper text
        heading: "#071A63",        // Blue Ink heading emphasis
        border: "#DDE4F7",          // Hairline border
        success: "#10B981",         // 🟢 Emerald
        warning: "#F59E0B",         // 🟠 Amber
        error: "#D40007",           // Dyna Red

        // Legacy compatibility aliases mapped to unified design tokens
        "brand-navy": "#071A63",
        "brand-blue": "#0A2FAE",
        "brand-blue-dark": "#08248A",
        "brand-royal-blue": "#0A2FAE",
        "brand-red": "#D40007",
        "accent-indigo-50": "#EEF2FF",
        "accent-indigo-300": "#0A2FAE",
        "accent-indigo-600": "#08248A",
        "text-grey": "#66789A",
        "surface-white": "#FFFFFF",
        "surface-light-grey": "#EEF2FF",
        "on-surface": "#33414F",
        "outline-variant": "#DDE4F7",
        "status-available": "#10B981",
        "status-pending": "#F59E0B",
        "status-held": "#D40007",
        "status-neutral": "#66789A",
      },
      fontFamily: {
        // Dyna-Serv Brand Guidelines: Avenir Next / Inter / JetBrains Mono.
        heading: ["Avenir Next", "Avenir", "sans-serif"],
        body: ["Inter", "Helvetica Neue", "Arial", "sans-serif"],
        label: ["JetBrains Mono", "SFMono-Regular", "monospace"],
        mono: ["JetBrains Mono", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // Type scale (specs/00-steering/design.md §7)
        "headline-xl": ["44px", { lineHeight: "52px", letterSpacing: "-0.02em" }],
        "headline-lg": ["30px", { lineHeight: "38px", letterSpacing: "normal" }],
        "headline-md": ["24px", { lineHeight: "32px", letterSpacing: "normal" }],
        "headline-sm": ["20px", { lineHeight: "28px", letterSpacing: "normal" }],
        // Compatibility aliases used by older page components. They resolve
        // to the same approved brand scale rather than browser defaults.
        "title-xl": ["44px", { lineHeight: "52px", letterSpacing: "-0.02em" }],
        "title-lg": ["30px", { lineHeight: "38px", letterSpacing: "normal" }],
        "title-md": ["24px", { lineHeight: "32px", letterSpacing: "normal" }],
        "title-sm": ["20px", { lineHeight: "28px", letterSpacing: "normal" }],
        "heading-lg": ["30px", { lineHeight: "38px", letterSpacing: "normal" }],
        "heading-md": ["24px", { lineHeight: "32px", letterSpacing: "normal" }],
        "data-display": ["20px", { lineHeight: "24px", letterSpacing: "normal" }],
        "body-lg": ["18px", { lineHeight: "28px", letterSpacing: "normal" }],
        "body-md": ["16px", { lineHeight: "24px", letterSpacing: "normal" }],
        "body-sm": ["14px", { lineHeight: "20px", letterSpacing: "normal" }],
        "body-xs": ["12px", { lineHeight: "16px", letterSpacing: "normal" }],
        label: ["12px", { lineHeight: "16px", letterSpacing: "0.14em" }],
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
