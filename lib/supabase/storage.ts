import { createClient } from "./server";

// Thin wrapper over Supabase Storage for documents (CIPL/WRR attachments,
// inspection evidence photos, barcode labels — see structure.md, tech.md).
// Bucket names/policies are defined per-feature once that feature's
// tasks.md is Approved; this file only wires the client.
export async function getStorageClient() {
  const supabase = await createClient();
  return supabase.storage;
}
