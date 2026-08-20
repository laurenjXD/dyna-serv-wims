// supabase/functions/vmi-daily-balance-trigger/index.ts
//
// Thin pg_cron invocation target — specs/12-vmi-billing Task C.4b.
// First Supabase Edge Function in this codebase (no prior
// `supabase/functions/` precedent to match — follows standard Deno/
// Supabase Edge Function conventions instead).
//
// Traceability:
//   specs/12-vmi-billing/tasks.md C.4b — "supabase/functions/
//     vmi-daily-balance-trigger/ — thin Deno Edge Function, first in this
//     codebase. Reads the shared secret from Supabase Vault, makes one
//     authenticated call to C.4a, no billing logic of its own."
//   specs/12-vmi-billing/design.md §2.2 "Invocation architecture" note
//     (2026-08-20).
//   specs/04-services-and-infrastructure/design.md §14.5 — locked
//     pg_cron + pg_net + Edge Function scheduling pattern.
//   specs/00-steering/revision-log.md, 2026-08-20 entry.
//
// This function does NOT compute anything billing-related. It exists
// solely to be pg_cron's HTTPS invocation target (via pg_net.http_post,
// see supabase/migrations/0034_vmi_daily_balance_cron_schedule.sql) and to
// make exactly one authenticated relay call into the Next.js app's real
// logic at POST /api/internal/vmi-daily-balance (C.4a,
// app/api/internal/vmi-daily-balance/route.ts).
//
// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------
//
//   supabase functions deploy vmi-daily-balance-trigger
//
// Required Edge Function secrets (set once per environment via
// `supabase secrets set`, NOT committed anywhere in this repo):
//
//   VMI_DAILY_BALANCE_SHARED_SECRET
//     The exact same shared-secret value as the Vercel/Next.js environment
//     variable of the same name that app/api/internal/vmi-daily-balance/
//     route.ts validates (C.4a). This function forwards it verbatim as the
//     `x-vmi-daily-balance-secret` request header C.4a expects — the header
//     name and env var name are intentionally identical between the two
//     sides of this relay so the contract is easy to audit.
//
//   VMI_APP_BASE_URL
//     Origin of the deployed Next.js app that owns the real route, e.g.
//     `https://app.example.com` (no trailing slash). This function POSTs to
//     `${VMI_APP_BASE_URL}/api/internal/vmi-daily-balance`.
//
// Note on the platform-level auth layer: Supabase Edge Functions require a
// valid gateway `Authorization` bearer token (project anon/service-role
// key) by default, separate from the two secrets above. That gateway token
// is supplied by pg_net's http_post call in the pg_cron migration (C.4c),
// not by this function — this function only knows about the app-level
// secret it forwards downstream.

const SECRET_HEADER = "x-vmi-daily-balance-secret";
const TARGET_PATH = "/api/internal/vmi-daily-balance";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sharedSecret = Deno.env.get("VMI_DAILY_BALANCE_SHARED_SECRET");
  const appBaseUrl = Deno.env.get("VMI_APP_BASE_URL");

  if (!sharedSecret || !appBaseUrl) {
    console.error(
      "[vmi-daily-balance-trigger] missing required secret(s): " +
        `VMI_DAILY_BALANCE_SHARED_SECRET=${sharedSecret ? "set" : "MISSING"}, ` +
        `VMI_APP_BASE_URL=${appBaseUrl ? "set" : "MISSING"}`,
    );
    return new Response(
      JSON.stringify({ error: "Edge Function misconfigured: missing secret(s)" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const targetUrl = `${appBaseUrl}${TARGET_PATH}`;

  let downstreamResponse: Response;
  try {
    downstreamResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SECRET_HEADER]: sharedSecret,
      },
      body: JSON.stringify({ triggeredAt: new Date().toISOString() }),
    });
  } catch (err) {
    // Network-level failure reaching the Next.js app (DNS, timeout, TLS,
    // connection refused, etc.) — no billing logic ran here to roll back;
    // just log and surface the failure so it's visible in Edge Function
    // logs / any downstream alerting on non-2xx invocations.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[vmi-daily-balance-trigger] fetch to ${targetUrl} failed: ${message}`);
    return new Response(
      JSON.stringify({ error: "Failed to reach vmi-daily-balance route", detail: message }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const downstreamBodyText = await downstreamResponse.text();

  if (!downstreamResponse.ok) {
    console.error(
      `[vmi-daily-balance-trigger] downstream route returned ${downstreamResponse.status}: ` +
        downstreamBodyText.slice(0, 2000),
    );
  }

  // Relay the downstream status/body as-is — this function adds no
  // interpretation of the billing result, it only reports whether the
  // relay itself succeeded and what the real route said.
  return new Response(downstreamBodyText, {
    status: downstreamResponse.status,
    headers: { "Content-Type": "application/json" },
  });
});
