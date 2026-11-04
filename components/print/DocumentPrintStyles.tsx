import { DOCUMENT_FONT_FAMILY, DOCUMENT_FONT_SIZE } from "@/lib/documents/document-contract";

type DocumentPrintStylesProps = {
  orientation?: "portrait" | "landscape";
};

/** Shared print contract for all official warehouse documents. */
export function DocumentPrintStyles({ orientation = "portrait" }: DocumentPrintStylesProps) {
  return (
    <style data-document-print-styles dangerouslySetInnerHTML={{
      __html: `
        /* Official document typography applies to the live preview as well as print. */
        [data-document-root],
        [data-document-root] :where(h1, h2, h3, h4, h5, h6, p, span, strong, em, label, dt, dd, li, td, th, caption, button) {
          font-family: ${DOCUMENT_FONT_FAMILY} !important;
        }
        /* Keep the document's 11pt base size, but allow intentional compact
           header/table utility sizes to control their own rhythm. */
        [data-document-root] {
          font-size: ${DOCUMENT_FONT_SIZE}pt !important;
          line-height: 1.35;
        }
        [data-document-root] * {
          font-family: ${DOCUMENT_FONT_FAMILY} !important;
        }
        @page {
          size: ${orientation};
          margin: 10mm 12mm 12mm 12mm;
        }
        @media print {
          [data-testid="desktop-sidebar"],
          [data-testid="floor-tab-bar"],
          nav[aria-label="Breadcrumb"],
          .print-hide,
          .print-hidden,
          .no-print {
            display: none !important;
            visibility: hidden !important;
          }
          html,
          body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: ${DOCUMENT_FONT_FAMILY} !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            font-size: ${DOCUMENT_FONT_SIZE}pt !important;
            line-height: 1.35 !important;
          }
          *,
          *::before,
          *::after {
            box-sizing: border-box !important;
          }
          main,
          [data-document-root] {
            margin: 0 !important;
            padding: 0 !important;
            max-width: none !important;
            width: 100% !important;
            background: #ffffff !important;
          }
          thead {
            display: table-header-group !important;
          }
          tfoot {
            display: table-footer-group !important;
          }
          tr,
          .print-avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .print-page-break {
            break-before: page !important;
            page-break-before: always !important;
          }
          table {
            width: 100% !important;
            page-break-inside: auto;
          }
          [data-document-table] {
            border-radius: 0 !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
            min-width: 0 !important;
          }
          [data-document-table] th {
            font-size: 7.5pt !important;
            line-height: 1.2 !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            vertical-align: middle !important;
          }
          [data-document-table] td {
            font-size: 8.5pt !important;
            line-height: 1.3 !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
            vertical-align: top !important;
          }
          /* Screen previews may ellipsize long names; the official document
             must preserve that information and allow its row to grow. */
          [data-document-root] .truncate {
            overflow: visible !important;
            text-overflow: clip !important;
            white-space: normal !important;
          }
          [data-document-table] th,
          [data-document-table] td {
            border-radius: 0 !important;
          }
        }
      `,
    }} />
  );
}
