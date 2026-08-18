"use client";

/**
 * Print trigger for the Reports page.
 *
 * A client component for one reason: `window.print()`. The page itself stays
 * server-rendered, and the printed output is produced by the @media print
 * rules in reports.module.css rather than by a separate print view — one
 * source of truth, so a figure can never differ between screen and paper.
 */
export default function PrintReportButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()} data-print-hide>
      Print
    </button>
  );
}
