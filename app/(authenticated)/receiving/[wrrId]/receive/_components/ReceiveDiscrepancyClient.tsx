"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanDiscrepancyModal } from "@/components/floor/ScanDiscrepancyModal";

interface ReceiveDiscrepancyClientProps {
  wrrId: string;
  wrrNumber: string;
  isError: boolean;
  reason?: string;
  scannedBarcode?: string;
}

export function ReceiveDiscrepancyClient({
  wrrId,
  wrrNumber,
  isError,
  reason,
  scannedBarcode,
}: ReceiveDiscrepancyClientProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(isError);

  const handleClose = () => {
    setIsOpen(false);
    router.replace(`/receiving/${wrrId}/receive`);
  };

  if (!isError && !isOpen) return null;

  return (
    <ScanDiscrepancyModal
      isOpen={isOpen}
      onClose={handleClose}
      scannedBarcode={scannedBarcode}
      reason={reason}
      contextType="receiving"
      contextRef={wrrNumber}
    />
  );
}
