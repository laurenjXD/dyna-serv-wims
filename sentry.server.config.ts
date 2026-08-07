import * as Sentry from "@sentry/nextjs";

// No-ops safely when NEXT_PUBLIC_SENTRY_DSN is unset (local dev without a
// Sentry project configured yet).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
});
