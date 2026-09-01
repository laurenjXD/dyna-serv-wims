"use client";

import React from "react";
import type { WrrDocumentRow } from "@/lib/db/queries/receiving";
import { WrrDocumentsTable } from "@/components/tables/WrrDocumentsTable";

export function WrrFilterableTable({
  rows,
  canCreate,
}: {
  rows: WrrDocumentRow[];
  canCreate: boolean;
}) {
  return <WrrDocumentsTable data={rows} canCreate={canCreate} />;
}
