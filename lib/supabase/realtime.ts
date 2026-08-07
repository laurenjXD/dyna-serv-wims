import { createClient } from "./client";

// Thin wrapper over Supabase Realtime (pending-approval queue,
// notifications — see tech.md). Channel names/payloads are defined
// per-feature once that feature's tasks.md is Approved; this file only
// wires the client.
export function getRealtimeClient() {
  return createClient();
}
