"use client";

import { useEffect, useState } from "react";

const DISMISS_AFTER_MS = 3_000;

type ReceiptUploadNoticeProps = {
  status: string;
};

function getReceiptUploadMessage(status: string) {
  if (status === "success") return "Delivery Receipt uploaded.";
  if (status === "removed") return "Delivery Receipt removed.";
  if (status === "invalid") return "Upload a PDF, PNG, or JPEG up to 10 MB.";
  if (status === "forbidden") return "You do not have permission to manage Delivery Receipts.";
  return "Delivery Receipt action failed. Please try again.";
}

export function ReceiptUploadNotice({ status }: ReceiptUploadNoticeProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setVisible(false), DISMISS_AFTER_MS);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  if (!visible) return null;

  return (
    <p
      role="status"
      aria-live="polite"
      className="mt-3 mb-6 rounded border border-status-available/30 bg-status-available/10 px-4 py-3 font-body text-body-sm text-on-surface"
    >
      {getReceiptUploadMessage(status)}
    </p>
  );
}
