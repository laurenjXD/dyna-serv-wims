"use server";

import { createPageResolver } from "@/lib/auth/page-resolver";
import { requestDocumentReprint } from "@/lib/actions/documents";

export async function requestDocumentReprintAction(input: {
  documentId: string;
  reason?: string;
}) {
  const resolver = await createPageResolver();
  return requestDocumentReprint(resolver, input);
}
