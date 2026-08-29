"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanDiscrepancyModal } from "@/components/floor/ScanDiscrepancyModal";

interface DispatchDiscrepancyClientProps {
  pickListId: string;
  pickListNumber: string;
  isError: boolean;
  reason?: string;
  scannedBarcode?: string;
}

export function DispatchDiscrepancyClient({
  pickListId,
  pickListNumber,
  isError,
  reason,
  scannedBarcode,
}: DispatchDiscrepancyClientProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(isError);

  const handleClose = () => {
    setIsOpen(false);
    router.replace(`/pick-lists/${pickListId}/dispatch`);
  };

  if (!isError && !isOpen) return null;

  return (
    <ScanDiscrepancyModal
      isOpen={isOpen}
      onClose={handleClose}
      scannedBarcode={scannedBarcode}
      reason={reason}
      contextType="dispatch"
      contextRef={pickListNumber}
    />
  );
}
