# Services & Infrastructure — Implementation Plan

Status: Draft
Updated: 2026-08-05

## Implementation gate

No infrastructure configuration, application integration, migration, provider provisioning, or deployment change may begin until:

- `requirements.md` and `design.md` are reviewed and internally consistent.
- The decisions in Task 0 are recorded.
- Provider/account changes are authorized by their owner.
- Both sign-offs at the end of this file are completed.
- This file's status is changed to `Approved`.

Documentation, cost discovery, read-only provider review, and local proof-of-concept testing are allowed before approval when they do not change shared or production state.

## Dependencies

- `01-core-data-model` determines migration order, critical tables, and backup integrity checks.
- `02-rbac-roles` determines Auth administration, session, service-role, and RLS boundaries.
- `03-offline-mode-and-client-storage` determines continuity behavior during service outages.
- `05-ui-shell-and-navigation` consumes Auth/session/configuration and protected routes.
- Feature specs `06` through `20` add service jobs, files, emails, realtime subscriptions, alerts, and capacity assumptions through the shared interfaces defined here.

## Test-layer legend

- **Unit**: Vitest or isolated configuration/adapter tests.
- **DB integration**: complete migrations and real PostgreSQL/Supabase-compatible behavior.
- **Integration**: sandbox/staging provider contract test.
- **E2E**: Playwright against an application environment.
- **Manual**: provider dashboard, DNS, access, restore, failover, or operational verification that cannot be automated safely.

## 0. Resolve infrastructure decisions

Testing: Manual review; no implementation tests.

- [ ] Record legal owner, technical owner, billing owner, and incident contact for Vercel, Supabase, Resend, Upstash, Sentry, DNS, and source-control/CI accounts.
  → Requires external input. Named owners must be recorded before sign-off.
- [ ] Select staging and production regions after measuring expected warehouse-to-service latency and reviewing data-processing requirements.
  → Requires external input. Design Section 5.3 states the selected region pair is documented before provisioning; the Philippine warehouse constraint is noted but the specific region has not been selected.
- [ ] Approve provider plans and paid capabilities, including PITR, Supabase Branching, Vercel custom environments/protection, log retention, and support.
  → Requires external input. Requirements Section 19 lists plan decisions; PITR and Supabase Branching are plan-dependent capabilities with no confirmed plan level in the spec.
- [ ] Approve production and staging application domains, Auth callback domains, and Resend sender subdomains/addresses.
  → Requires external input. No production domain has been selected in the spec.
- [ ] Approve the environment model: local/CI, dedicated staging Supabase project, and dedicated production Supabase project.
  → Decision recorded. Design Section 5.2 defines: two persistent remote Supabase projects (staging and production) plus ephemeral local/CI stack. Supabase Branching is a plan-dependent enhancement. This model is derivable from and consistent with the spec.
- [ ] Approve the Data API as the default user-RLS path and define the evidence required before allowing user-scoped Drizzle transactions.
  → Decision recorded. Design Section 8.2 designates the Supabase session client/Data API as the mandatory default for user-RLS paths. Section 8.6 (operation-category matrix) documents when each path applies. A user-scoped Drizzle transaction wrapper requires real-Postgres identity-isolation tests to pass before adoption (design Section 23 item 9 / tasks Section 4).
- [ ] Approve Supabase Edge Functions + Cron as the v1 background executor and record BullMQ deferral criteria.
  → Decision recorded. Requirements Section 11 (FR-13) and design Section 14.1 select Edge Functions + Cron as the v1 background executor. BullMQ deferral criteria are recorded in design Section 14.6.
- [ ] Approve RPO, RTO, availability, latency, support-hours, and alert-response targets.
  → Requires external input. Draft targets are listed in requirements Section 16 but require product-owner approval before production.
- [ ] Select protected Storage backup/export destination and retention.
  → Requires external input. Design Section 18.2 defines the process but the destination has not been selected.
- [ ] Approve MIME/size allowlists and malware-scanning or restricted-file policy.
  → Requires external input. Design Section 10.3 notes the malware-scanning decision is a production launch gate; specific allowlists require owner approval.
- [ ] Approve Auth session duration, password policy, and administrator MFA requirement with spec `02`.
  → Requires external input. Design Section 9.2 notes these are configured with spec `02`; spec `02` has not reached Approved status.
- [ ] Approve rate-limit privacy/retention policy and initial endpoint limits.
  → Requires external input. Design Section 13 defines the limiter classes and fail policies; exact limit values and retention require owner approval after load testing.
- [ ] Approve Sentry PII policy, sampling, retention, Session Replay prohibition/default, and alert destinations.
  → Requires external input. Design Section 15.2 defines defaults (Session Replay off, scrubbing rules, sampling); specific sampling rates, retention periods, and alert destinations require owner approval.
- [ ] Approve audit, job, email-delivery, webhook, and provider-log retention periods.
  → Requires external input. Retention periods are referenced throughout the spec but not assigned specific values; owner approval required.
- [ ] Update `requirements.md`, `design.md`, and the steering revision log with resolved choices before approval.
  → Action item. Decisions recorded above in design.md (Sections 8.6, 10.1, 10.2, 14.2, 14.4, 15.3, 22, 23) and in this tasks.md. Remaining external-input decisions must be recorded when approved.

## 1. Establish configuration and dependency baseline

Testing: Unit, build, Manual secret review.

- [ ] Pin a supported Node.js runtime and package-manager version for local, CI, and Vercel builds.
- [ ] Commit and enforce the package lockfile; define the reproducible install command.
- [ ] Add approved dependencies for Supabase SSR/client, Drizzle/PostgreSQL driver, Resend, Upstash, Sentry, and configuration validation.
- [ ] Create server-only and client-safe validated environment schemas under the approved `lib/config` structure.
- [ ] Add production safeguards rejecting placeholder values, local URLs, staging project references, and missing secrets.
- [ ] Centralize environment reads through the validated configuration module.
- [ ] Document every environment variable, owner, scope, rotation path, and whether it is build-time or runtime.
- [ ] Provide a committed non-secret environment example file.
- [ ] Ensure all real environment files and provider credential exports are ignored by version control.
- [ ] Add a CI/browser-bundle check for prohibited server variable names and known secret patterns.
- [ ] Unit-test valid local/test configuration, invalid production configuration, and public-variable allowlisting.

## 2. Provision and isolate environments

Testing: Integration, Manual.

- [ ] Configure the Supabase CLI local stack and deterministic synthetic seed data.
- [ ] Create an isolated CI database/Supabase workflow that applies all migrations from empty state.
- [ ] Provision a dedicated staging Supabase project in the approved region.
- [ ] Provision a dedicated production Supabase project in the approved region.
- [ ] Configure separate Vercel Preview/staging and Production environment variables.
- [ ] Verify no production credential exists in Development or Preview scope.
- [ ] Provision separate Resend, Upstash, and Sentry environment credentials/projects or strict environment namespaces as approved.
- [ ] Enable Vercel Deployment Protection for preview/deployment URLs.
- [ ] Configure a CI-only deployment-protection bypass for E2E if required and verify it is not exposed to browser code.
- [ ] Document whether Supabase Branching is enabled; if disabled, ensure PRs cannot push schema to shared staging.
- [ ] Add an automated environment-identity check that fails if a nonproduction deployment points to production.
- [ ] Manually verify staging cannot read production Auth, database, Storage, Redis, email, or monitoring state.

## 3. Configure Next.js and Vercel runtime

Testing: Unit/build, E2E, Manual headers/domain verification.

- [ ] Configure Next.js 15 App Router production settings and approved Node runtime.
- [ ] Mark server-only integration modules to prevent client imports.
- [ ] Restrict Edge Middleware/runtime to compatible lightweight concerns; prohibit Drizzle TCP access there.
- [ ] Implement correlation-ID ingress and safe response/support reference behavior.
- [ ] Implement `/api/health` liveness and safe readiness behavior without topology/secret leakage.
- [ ] Configure production and staging domains and HTTPS.
- [ ] Define HSTS, CSP, frame-ancestor, content-type, referrer, and permissions headers.
- [ ] Run CSP in staging report-only mode, resolve violations, and promote an enforcement policy.
- [ ] Configure Secure/HttpOnly/SameSite cookie behavior through the Supabase SSR integration.
- [ ] Add origin/CSRF checks to sensitive Server Actions and Route Handlers.
- [ ] Verify no unauthenticated health/error endpoint returns provider URLs, SQL, stack traces, or secrets.
- [ ] E2E-test protected preview access, security headers, cookies, Auth redirect behavior, health, and representative Server Actions.

## 4. Implement Supabase clients and database connections

Testing: Unit, DB integration, Integration, E2E.

- [ ] Create separate browser, server-session, and server-admin Supabase clients.
- [ ] Ensure the admin/service-role client is importable only from trusted server modules.
- [ ] Create the Drizzle runtime client using the Supabase transaction pooler with prepared statements disabled.
- [ ] Bound connection/pool size and configure connection, statement, lock, and idle transaction timeouts.
- [ ] Create a separate migration/admin connection using the direct/session endpoint.
- [ ] Implement classified transient-connection handling without blindly retrying non-idempotent writes.
- [ ] Add stale-connection/liveness handling appropriate to Vercel serverless suspension.
- [ ] Make the Supabase session client/Data API the default protected user data path.
- [ ] If required, prototype the user-scoped Drizzle transaction wrapper with transaction-local identity/role only; do not adopt it until the required tests pass.
- [ ] Prove pooled connections cannot leak one user's `auth.uid()`/claims into another request.
- [ ] Prove an absent/invalid identity fails closed under RLS.
- [ ] Verify Drizzle schema exports and SQL migrations describe compatible database objects.
- [ ] Run `db-migration-verifier` against the complete migration chain before sign-off.
- [ ] Run `rbac-rls-reviewer` against all protected access paths before sign-off.

## 5. Establish migration workflow

Testing: DB integration, Integration, Manual production rehearsal.

- [ ] Configure `supabase/config.toml` and migration directories according to repository conventions.
- [ ] Establish one-concern, sequential migration naming and immutable-after-application policy.
- [ ] Add CI reset/apply from an empty database with synthetic seed data.
- [ ] Add migration lint/review checks for destructive SQL, missing RLS, unsafe function privileges, missing timeouts, and direct remote drift.
- [ ] Add staging deployment using the Supabase CLI or approved integration.
- [ ] Add serialized production migration execution with a deployment lock.
- [ ] Document expand/migrate/contract examples and release ordering.
- [ ] Document forward-fix and restore criteria; do not add automatic destructive down migration execution.
- [ ] Rehearse a backward-compatible migration plus app rollback in staging.
- [ ] Rehearse a failed migration and verify the release remains blocked and diagnosable.

## 6. Configure Supabase Auth and Resend SMTP

Testing: Unit, Integration, E2E, Manual DNS/provider verification.

- [ ] Disable public self-registration in staging and production.
- [ ] Configure exact site URL and approved redirect URL allowlists per environment.
- [ ] Configure session duration, refresh behavior, password, security-email, and approved MFA settings.
- [ ] Configure invitation, recovery, and email-change templates using approved branding and safe redirect parameters.
- [ ] Verify Resend Auth sending subdomain/address and configure SPF, DKIM, and DMARC.
- [ ] Configure Resend as Supabase Auth custom SMTP in staging and production.
- [ ] Set and validate Supabase Auth email rate limits appropriate to invitation-only access.
- [ ] Implement server-only Auth administration for invite, deactivate, and session revocation.
- [ ] Connect Auth administration to RBAC authorization and durable security events from spec `02`.
- [ ] Add generic public error behavior preventing account enumeration.
- [ ] E2E-test invitation, password setup, sign-in, refresh, sign-out, recovery, revoked session, invalid redirect, and inactive user behavior.
- [ ] Manually verify Auth email deliverability and links in common target mail clients.

## 7. Configure Supabase Storage

Testing: Unit, DB/Storage integration, E2E, Manual recovery/security review.

- [ ] Finalize and create private buckets for CIPL documents, inspection evidence, generated documents, and barcode labels.
- [ ] Define source-controlled bucket configuration and Storage RLS policies.
- [ ] Implement server-generated object paths and source-resource linkage.
- [ ] Implement MIME, extension, size, and filename validation.
- [ ] Implement signed upload/download flows or server-proxied flows according to file size/risk.
- [ ] Ensure signed URLs are short-lived and issued only after source-record authorization.
- [ ] Implement safe response headers and sandboxed preview behavior for supported files.
- [ ] Implement cleanup/reconciliation for object upload success with database-link failure and vice versa.
- [ ] Implement approved object retention/deletion workflow with auditability.
- [ ] Implement malware scanning or the approved restricted-file alternative before arbitrary external uploads are accepted.
- [ ] Implement Storage inventory/export with manifest and hashes to the approved secondary destination.
- [ ] Test cross-party, cross-role, guessed-path, expired-link, MIME spoofing, oversized-file, and orphan cleanup cases.
- [ ] Perform an isolated object restore and verify hashes/source links.

## 8. Configure Supabase Realtime

Testing: Unit, DB integration, E2E.

- [ ] Inventory approved Realtime use cases and required tables/events.
- [ ] Limit Realtime publication to minimum required rows/events/columns.
- [ ] Configure authenticated RLS-scoped subscriptions.
- [ ] Implement event-as-invalidation behavior followed by authoritative refetch.
- [ ] Implement reconnect and browser-visibility reconciliation.
- [ ] Provide polling/manual refresh fallback for approval queues and notifications.
- [ ] Verify workflows remain correct with delayed, duplicated, out-of-order, or absent Realtime events.
- [ ] E2E-test cross-party isolation and reconnect behavior.
- [ ] Monitor connection/message volume against plan limits.

## 9. Implement application transactional email

Testing: Unit, DB integration, Integration, E2E/webhook tests.

- [ ] Verify the operational Resend sending subdomain/address and DNS records.
- [ ] Create the shared email adapter with environment recipient restrictions.
- [ ] Define versioned templates and a rendering/preview test strategy.
- [ ] Add the `email_deliveries` lifecycle schema through approved migrations.
- [ ] Enqueue application email from committed domain events/jobs rather than inline fire-and-forget sends.
- [ ] Generate stable Resend idempotency keys.
- [ ] Persist provider email/message identifiers and sanitized failure state.
- [ ] Implement transient retry and permanent bounce/suppression handling.
- [ ] Implement `/api/webhooks/resend` using raw-body signature verification.
- [ ] Add `webhook_receipts` deduplication and out-of-order event handling.
- [ ] Reject invalid signatures and oversized/unsupported webhook requests before mutation.
- [ ] Verify email failure does not roll back committed inventory or approval state.
- [ ] Test duplicate send requests, duplicate webhook delivery, webhook replay, out-of-order events, bounce, suppression, and provider timeout.
- [ ] Monitor bounce/complaint/failure rates and configure alerts.

## 10. Implement Upstash rate limiting

Testing: Unit, Integration, E2E.

- [ ] Provision staging and production Upstash databases in approved regions.
- [ ] Create a shared rate-limit adapter with endpoint/risk-class policies.
- [ ] Implement environment/namespace-prefixed keys.
- [ ] Implement HMAC-based normalized account identifiers without storing raw email/tokens.
- [ ] Configure separate Auth-adjacent, privileged mutation, warehouse operation, webhook, expensive feature, and low-risk read limiters.
- [ ] Implement explicit fail-open/fail-closed handling for Redis timeout/unavailability by class.
- [ ] Add standard retry/limit response metadata without revealing policy internals.
- [ ] Ensure scan workflows use operation-specific burst/idempotency controls, not generic public limits.
- [ ] Enable approved analytics and retention settings.
- [ ] Unit-test windows/buckets with a deterministic clock.
- [ ] Integration-test Upstash success, limit exceeded, timeout, malformed configuration, and recovery.
- [ ] E2E-test user-visible behavior for Auth/admin/scan/expensive endpoints.

## 11. Implement durable background jobs and schedules

Testing: Unit, DB integration, Integration, Manual operations.

- [ ] Add migrations for `service_jobs` with status, payload version, idempotency key, lease, retry, actor, and correlation fields.
- [ ] Add indexes for claim order, available time, status, lease expiry, and unique idempotency.
- [ ] Implement typed/versioned payload validation and handler registry.
- [ ] Implement transactional enqueue helpers for domain mutations.
- [ ] Implement atomic bounded-batch claim with lease ownership and concurrent-worker safety.
- [ ] Implement idempotent completion, retry classification, exponential backoff with jitter, dead-letter, and cancellation rules.
- [ ] Implement expired-lease recovery.
- [ ] Create Supabase Edge Function worker entry points with server-only secrets.
- [ ] Configure Supabase Vault values for scheduled invocation.
- [ ] Add source-controlled `pg_cron`/Supabase Cron schedules in UTC.
- [ ] Add Asia/Manila business-time schedule documentation and tests.
- [ ] Propagate original actor, executor, resource, and correlation ID.
- [ ] Implement authorized dead-letter inspection and safe replay procedure.
- [ ] Test duplicate invocation, concurrent claim, worker crash, lease expiry, transient/permanent error, stale payload version, and replay.
- [ ] Load-test expected queue volume below Edge Function/Cron duration and concurrency limits.
- [ ] Record measured thresholds that would trigger BullMQ/worker reevaluation.

## 12. Implement Sentry and operational telemetry

Testing: Unit, Integration, E2E, Manual alert verification.

- [ ] Provision/configure Sentry project environments and ownership.
- [ ] Add client, server, and Edge configuration only where each runtime exists.
- [ ] Register Sentry through Next.js instrumentation.
- [ ] Configure release/source revision and trusted-build source-map upload.
- [ ] Ensure `SENTRY_AUTH_TOKEN` is build-only and not present at runtime/browser.
- [ ] Implement `beforeSend`/equivalent scrubbing for secrets, cookies, Auth, PII, documents, pricing, and large payloads.
- [ ] Disable Session Replay by default on authenticated/floor/admin screens.
- [ ] Configure environment-specific trace/error sampling and cost caps.
- [ ] Propagate correlation IDs through requests, DB events, jobs, email, and webhooks.
- [ ] Classify expected validation/authorization outcomes to prevent alert noise.
- [ ] Configure alerts for critical workflows, migrations, database capacity, jobs, email, Storage, Auth, and integration degradation.
- [ ] Send controlled client/server/Edge/job test errors and verify release/environment/correlation.
- [ ] Inspect captured payloads manually and prove prohibited data is absent.
- [ ] Document Vercel, Supabase, Resend, Upstash, and Sentry diagnostic links/runbooks without storing secrets.

## 13. Build CI/CD and release controls

Testing: Pipeline self-test, Integration, E2E, Manual release rehearsal.

- [ ] Configure PR checks for locked install, lint/format, typecheck, Vitest, database reset/migrations, real-Postgres tests, production build, and selected Playwright tests.
- [ ] Add secret scanning and dependency/security audit according to approved tooling.
- [ ] Ensure PR jobs use only isolated nonproduction credentials/data.
- [ ] Create protected Vercel preview deployment after required build checks.
- [ ] Add staging migration, Edge Function, and application deployment workflow.
- [ ] Add production promotion with authorized/manual gate and serialized migration lock.
- [ ] Record source revision, migrations, deployment owner, and result for each production release.
- [ ] Add non-destructive smoke tests for health, Auth, protected shell, database, Storage, and critical integrations.
- [ ] Verify Sentry release and job/cron health after deployment.
- [ ] Rehearse Vercel rollback to a prior schema-compatible deployment.
- [ ] Rehearse Edge Function rollback/redeploy.
- [ ] Rehearse database forward-fix and define PITR/restore decision authority.
- [ ] Prove a failing migration, test, secret check, or smoke test blocks promotion.

## 14. Implement backup and recovery controls

Testing: DB integration, E2E smoke on restore, Manual disaster-recovery exercise.

- [ ] Enable the approved Supabase backup plan and PITR configuration.
- [ ] Configure backup/PITR status review and alerts.
- [ ] Document safe pre-migration logical backup procedure for high-risk releases.
- [ ] Build the Storage export/manifest/hash process to the approved secondary destination.
- [ ] Document recovery of Vercel, Supabase, Resend, Upstash, Sentry, DNS, Cron, Vault, Auth, and environment configuration.
- [ ] Create an isolated restore environment that cannot email real users, invoke production webhooks, or run production cron jobs.
- [ ] Restore a database backup/PITR point into isolation.
- [ ] Verify migration history, critical row counts/checksums, inventory ledger integrity, RLS, and RBAC.
- [ ] Restore protected Storage objects and verify hashes/source linkage.
- [ ] Run application smoke and selected E2E tests against the restore.
- [ ] Measure achieved RPO/RTO and compare with approved targets.
- [ ] Record gaps, owners, and remediation; repeat until launch targets pass.
- [ ] Schedule recurring restore tests after launch.

## 15. Establish security, access, cost, and incident operations

Testing: Manual audit/tabletop exercises; selected automated policy checks.

- [ ] Enable individual provider accounts and MFA for production administrators where supported.
- [ ] Define least-privilege human and CI roles for every provider.
- [ ] Remove shared credentials and document joiner/mover/leaver access procedure.
- [ ] Create quarterly provider-access review checklist.
- [ ] Create secret inventory and rotation runbooks, including overlap and old-key revocation.
- [ ] Configure billing/quota alerts and owner for every service.
- [ ] Record plan limits, expected load, warning threshold, hard-limit behavior, and escalation.
- [ ] Create the required incident runbooks listed in `design.md` section 21.
- [ ] Define maintenance-window and warehouse communication procedure.
- [ ] Run tabletop exercises for database outage, Auth outage, leaked service key, migration failure, job backlog, and Storage loss.
- [ ] Verify offline/manual continuity choices match approved spec `03` and do not authorize Tier 2 actions offline.
- [ ] Create monthly initial cost/capacity review and post-volume-change review.
- [ ] Define incident/postmortem record location and link defects back to feature tasks pending the testing bug-tracking decision.

## 16. Production readiness verification

Testing: Full automated suite plus Manual launch review.

- [ ] Confirm all feature specs included in launch have approved `tasks.md` and sign-offs.
- [ ] Run full lint, typecheck, unit, real-Postgres integration, build, and Playwright suites.
- [ ] Run `db-migration-verifier` against the production-equivalent migration chain.
- [ ] Run `rbac-rls-reviewer` against user, party, service-role, Storage, Realtime, and background-job access.
- [ ] Verify no production secret exists in repository history, browser bundles, preview configuration, logs, or Sentry events.
- [ ] Verify staging and production isolation.
- [ ] Verify domains, HTTPS, security headers, Auth redirects, and email DNS/deliverability.
- [ ] Verify critical alerts reach the named responder.
- [ ] Verify no dead-letter/backlog, failed cron, migration drift, or backup alarm exists.
- [ ] Complete isolated database and Storage restore tests within approved RPO/RTO.
- [ ] Complete physical warehouse QA required by `testing.md`.
- [ ] Complete operations handoff, access review, cost review, runbook review, and launch approval.

## Testing requirements summary

### Unit tests

- [ ] Configuration validation and public/server separation.
- [ ] Rate-limit policies, identifiers, and dependency-failure behavior.
- [ ] Job payloads, retry/backoff, idempotency, and error classification.
- [ ] Email rendering, idempotency, webhook ordering/deduplication.
- [ ] Telemetry scrubbing and correlation propagation.
- [ ] Storage path/MIME/size validation.

### Real-Postgres integration tests

- [ ] Full migration reset/apply and Drizzle compatibility.
- [ ] RLS identity paths and pooled-connection isolation.
- [ ] Job claim/lease/concurrency/recovery.
- [ ] Email/webhook operational table constraints.
- [ ] Immutable ledger and security/audit protections after restore.

### Provider integration tests

- [ ] Supabase Auth, Storage, Realtime, Edge Functions, Cron, and backup configuration.
- [ ] Resend API/SMTP and signed webhooks.
- [ ] Upstash limits and outage behavior.
- [ ] Sentry errors, releases, source maps, alerts, and redaction.
- [ ] Vercel preview/production configuration and protection.

### Playwright E2E tests

- [ ] Auth lifecycle and protected shell.
- [ ] Environment/domain/security-header behavior.
- [ ] Private file access and cross-party denial.
- [ ] Realtime fallback/reconnect.
- [ ] Rate-limit user experience.
- [ ] Job/email eventual completion where user-visible.
- [ ] Post-deploy and restored-environment smoke suites.

### Manual QA and operations

- [ ] DNS/email deliverability.
- [ ] Provider access/MFA and secret rotation.
- [ ] Migration/deployment/rollback rehearsal.
- [ ] Backup and isolated restore.
- [ ] Alert delivery and incident tabletop exercises.
- [ ] Cost/quota dashboards and owners.
- [ ] Pre-launch physical warehouse QA.

## Sign-off

- [ ] All decisions in Task 0 recorded in requirements/design
      Note: Three decisions are now recorded in design.md (environment model §5.2, Data API as default RLS path §8.2/8.6, Edge Functions + Cron as v1 executor §14.1/14.6). Twelve decisions still require external input from named owners before this item can be checked.
- [ ] All applicable automated and manual testing layers pass
- [ ] `db-migration-verifier` review complete
- [ ] `rbac-rls-reviewer` review complete
- [ ] Security/secrets review complete
- [ ] Backup and isolated restore exercise complete
- [ ] Operations/runbook handoff complete
- [ ] Product owner approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
