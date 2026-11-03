import { rgb } from "pdf-lib";
export const PDF_PAGE = {
  portrait: { width: 612, height: 792 },
  landscape: { width: 841.89, height: 595.28 },
} as const;

/**
 * PDF points are not CSS pixels. Keep body copy readable while reserving
 * enough room for operational tables to wrap instead of colliding.
 */
export const PDF_FONT_SIZE = 9;

export const PDF_TYPE_SCALE = {
  caption: 7,
  table: 8,
  body: PDF_FONT_SIZE,
  section: 11,
  title: 15,
} as const;

export const PDF_THEME = {
  margin: 28,
  ink: rgb(0.07, 0.1, 0.16),
  muted: rgb(0.39, 0.46, 0.58),
  grid: rgb(0.75, 0.8, 0.88),
  headerFill: rgb(0.92, 0.95, 0.98),
  accentNavy: rgb(0.0, 0.17, 0.29),
} as const;
