"use client";

import { useEffect } from "react";

const EXCLUDED_TABLE_SELECTOR = "table[data-document-table], table.sr-only, table[aria-hidden='true']";

/**
 * Gives ordinary interactive tables a labeled stacked-card presentation on
 * narrow screens. Print/document tables and chart accessibility tables stay
 * semantic tables and are deliberately excluded.
 */
export function MobileTableEnhancer() {
  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll("table:not([data-document-table]):not(.sr-only):not([aria-hidden='true'])").forEach((table) => {
        if (table.matches(EXCLUDED_TABLE_SELECTOR) || table.closest("[data-mobile-table-ignore='true']")) return;

        const headers = Array.from(table.querySelectorAll("thead th")).map((header) =>
          header.textContent?.replace(/\s+/g, " ").trim() ?? "",
        );
        if (headers.length === 0) return;

        if (table.getAttribute("data-mobile-card-table") !== "true") {
          table.setAttribute("data-mobile-card-table", "true");
        }
        table.querySelectorAll("tbody tr").forEach((row) => {
          Array.from(row.children).forEach((cell, index) => {
            if (!(cell instanceof HTMLElement) || cell.hasAttribute("colspan")) return;
            const label = headers[index] || "Details";
            if (cell.getAttribute("data-mobile-label") !== label) {
              cell.setAttribute("data-mobile-label", label);
            }
          });
        });
      });
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
