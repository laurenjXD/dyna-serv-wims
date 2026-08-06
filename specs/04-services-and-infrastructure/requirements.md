# Services & Infrastructure — Requirements

Status: Approved
Updated: 2026-08-05

Depends on:

- `specs/00-steering/product.md`
- `specs/00-steering/tech.md`
- `specs/00-steering/structure.md`
- `specs/00-steering/testing.md`
- `specs/01-core-data-model/`
- `specs/02-rbac-roles/`
- `specs/03-offline-mode-and-client-storage/`

## 1. Overview

This feature defines the shared runtime, cloud services, environment strategy, secrets, deployment process, operational controls, and recovery requirements for Hyperion 3PL / Dyna-Serv.

The locked stack is:

- Next.js 15 App Router on Vercel.
- Supabase managed PostgreSQL, Auth, Storage, Realtime, Edge Functions, and Cron.
- Drizzle ORM for schema definitions, migrations, and typed server-side database access.
- Resend for application email and as the custom SMTP provider for Supabase Auth.
- Upstash Redis and `@upstash/ratelimit` for distributed rate limiting.
- Sentry for client, server, and edge error/performance monitoring.
- Supabase Edge Functions plus `pg_cron`/Supabase Cron for v1 background work.

Redis plus BullMQ is not part of the v1 runtime. It may be reconsidered if approved workloads require a continuously running worker, long-running jobs, queue throughput, or workflow controls that the Supabase job design cannot safely provide.

## 2. Goals

- Keep production data and credentials isolated from local, test, preview, and staging environments.
- Provide a reproducible local and CI environment from committed configuration and migrations.
- Deploy application, database, Edge Function, Storage, Auth, and scheduled-job changes safely.
- Preserve Supabase RLS and authenticated identity across every protected data-access path.
- Prevent server-only credentials from reaching browser bundles or untrusted logs.
- Make external calls, jobs, emails, and webhooks idempotent, retryable, observable, and auditable.
- Establish backup, restore, rollback, incident-response, and service-ownership procedures before launch.
- Control cost and vendor quotas without weakening warehouse-critical workflows.

## 3. Environment requirements

### FR-1: Environment isolation

1. The system SHALL define four logical environments: local development, CI/test, staging/preview, and production.
2. Production SHALL use a dedicated Supabase project, Vercel production environment, Resend credentials/domain configuration, Upstash database, and Sentry environment.
3. Staging SHALL use credentials and data stores separate from production.
4. Local and CI environments SHALL use the Supabase CLI/local stack or an isolated ephemeral database and SHALL NOT connect to production.
5. Vercel Preview deployments SHALL NOT receive production database, service-role, Resend, Upstash, webhook, or monitoring credentials.
6. Preview deployments SHALL use protected access unless a specific public-review requirement is approved.
7. Production data SHALL NOT be copied to staging, preview, local, or CI without an approved sanitization process.
8. If Supabase Branching is enabled, preview branches SHALL contain schema and synthetic seed data only by default.

### FR-2: Environment configuration

1. Every required environment variable SHALL be documented, typed, and validated at process startup or build time as appropriate.
2. Public variables SHALL be explicitly allowlisted. Only values safe for browser exposure may use the `NEXT_PUBLIC_` prefix.
3. Environment-specific Auth site URLs, redirect allowlists, Storage URLs, webhook endpoints, and email sender identities SHALL be configured independently.
4. Missing or malformed production configuration SHALL fail deployment or startup before accepting traffic.
5. Configuration changes SHALL require a new deployment or documented service reconfiguration and SHALL be auditable through the relevant provider.

## 4. Application hosting requirements

### FR-3: Next.js and Vercel runtime

1. The application SHALL use Next.js 15 App Router with Server Components, Server Actions, and Route Handlers according to feature needs.
2. Node.js SHALL be the default runtime for database, email, storage administration, Sentry server instrumentation, and other server-only integrations.
3. Edge runtime usage SHALL be limited to code whose dependencies and security model are explicitly compatible; Drizzle TCP database access SHALL NOT execute in Edge Middleware.
4. Server Actions and Route Handlers SHALL enforce authentication, authorization, validation, rate limits where required, and idempotency independently of UI controls.
5. Vercel deployments SHALL be immutable and identified by source revision and environment.
6. Preview deployments SHALL be generated for review without automatically modifying production services.
7. Production deployment SHALL require all mandatory quality gates and an authorized promotion.

### FR-4: Domains, transport, and headers

1. Production SHALL use an approved custom HTTPS domain.
2. HTTPS SHALL be mandatory in production; insecure requests SHALL redirect or fail safely.
3. The application SHALL define Content Security Policy, HSTS, frame-ancestor protection, content-type protection, referrer policy, and permissions policy appropriate to required scanner/camera features.
4. Cookies SHALL use Secure, HttpOnly where server-managed, appropriate SameSite behavior, and the narrowest viable path/domain.
5. Auth redirects SHALL be restricted to approved local, preview/staging, and production URLs.
6. CORS SHALL default to same-origin and expose only explicitly approved webhook/API endpoints.

## 5. Database and data-access requirements

### FR-5: PostgreSQL environments and connections

1. Supabase PostgreSQL SHALL be the authoritative database.
2. Vercel/serverless runtime database connections SHALL use the Supabase transaction pooler with prepared statements disabled, or the stateless Supabase Data API when appropriate.
3. Direct database connections SHALL be reserved for migrations, backup/restore, approved administrative tooling, and workloads requiring a session connection.
4. Browser code SHALL NOT receive a PostgreSQL connection string or database password.
5. Runtime connection counts, timeouts, retries, and pool sizes SHALL be bounded and observable.
6. Connection reuse SHALL account for serverless suspension and stale TCP connections.
7. Database operations SHALL use explicit timeouts and SHALL NOT retry non-idempotent transactions blindly.

### FR-6: Drizzle and RLS

1. Drizzle SHALL define and export the typed application schema and support trusted server-side queries and transactions.
2. SQL migrations under `supabase/migrations/` SHALL remain the deployable database history and SHALL be tested in order.
3. User-scoped data access SHALL preserve the authenticated Supabase identity so PostgreSQL RLS evaluates the caller.
4. Protected access MAY use the Supabase session client/Data API or a real-Postgres-verified Drizzle transaction wrapper that sets transaction-local claims and role safely.
5. RLS SHALL NOT be disabled or bypassed merely to standardize on one query API.
6. Service-role or database-owner access SHALL be server-only, narrowly scoped, and auditable.
7. Remote schema changes SHALL occur only through committed migrations; routine Dashboard schema edits in staging or production are prohibited.
8. Production migrations SHALL be forward-compatible with the currently deployed application or use a documented expand/migrate/contract sequence.

### FR-7: Database integrity and performance

1. Database constraints SHALL remain authoritative for invariants that must survive concurrent requests.
2. Migrations SHALL define required indexes and verify query plans for critical inventory, approval, and party-scoped paths.
3. Long-running migrations SHALL set appropriate lock and statement timeouts and include an operational rollout plan.
4. Database functions, triggers, RLS helpers, and scheduled SQL SHALL be version-controlled and real-Postgres tested.
5. Connection, storage, query-latency, lock, and database-size thresholds SHALL be monitored before they become service outages.

## 6. Authentication requirements

### FR-8: Supabase Auth infrastructure

1. Supabase Auth SHALL manage user identity, password setup/recovery, refresh tokens, and sessions.
2. Next.js SSR integration SHALL use the supported Supabase SSR cookie pattern and server-side user validation.
3. Authorization roles and party scope SHALL remain in application tables as defined by spec `02`, not in client-controlled metadata.
4. Public self-registration SHALL remain disabled unless spec `02` is revised and approved.
5. Admin Auth APIs and service-role credentials SHALL run only in trusted server code.
6. Session duration SHALL be 24 hours with refresh enabled and revocation on deactivation; MFA SHALL be optional in v1, with enrollment and recovery behavior documented before production.
7. Auth event URLs and email redirects SHALL not accept arbitrary redirect targets.
8. Auth logs SHALL be included in authentication incident diagnosis.

## 7. Storage requirements

### FR-9: Supabase Storage

1. Supabase Storage SHALL store CIPL files, inspection evidence, generated operational documents, and barcode-label assets.
2. Protected buckets SHALL be private and governed by Storage RLS or short-lived signed access after source-record authorization.
3. Storage object paths SHALL use stable source identifiers and SHALL NOT rely on obscurity for authorization.
4. Uploads SHALL enforce allowlisted MIME types, extension consistency, maximum size, ownership/source linkage, and server-generated object paths.
5. File names and metadata SHALL be sanitized before display or response headers.
6. Untrusted files SHALL not execute in the application origin; browser previews SHALL use safe content disposition/sandboxing appropriate to the file type.
7. Replaced or deleted business documents SHALL follow an approved retention and legal/audit policy rather than immediate untracked deletion.
8. Storage access failures and suspicious upload attempts SHALL be observable.
9. A malware-scanning or restricted-file-handling decision SHALL be completed before accepting arbitrary external uploads in production.

## 8. Realtime requirements

### FR-10: Supabase Realtime

1. Supabase Realtime SHALL support approved pending-approval and notification updates.
2. Realtime SHALL be an update signal, not the sole durable source of truth.
3. Clients SHALL refetch or reconcile authoritative state after reconnect, missed events, or visibility restoration.
4. Channel subscriptions and published rows SHALL obey RLS and effective party/role scope.
5. Global event streams filtered only in browser code are prohibited.
6. Realtime publication SHALL be limited to required tables/events to control exposure and cost.
7. Workflows SHALL remain correct when Realtime is unavailable or delayed.

## 9. Email requirements

### FR-11: Resend and Auth SMTP

1. Resend SHALL send application transactional email.
2. Supabase Auth production email SHALL use Resend custom SMTP or an approved Supabase Auth email hook backed by Resend; the Supabase demonstration SMTP service SHALL NOT be used in production.
3. Production sending SHALL use verified subdomains with SPF, DKIM, and DMARC configured.
4. Auth and application-operational sender identities SHOULD be separated by subdomain or sender address to isolate reputation and intent.
5. Marketing email is out of scope and SHALL NOT share transactional/Auth workflows.
6. Application email sends SHALL use idempotency keys derived from a durable business event or delivery record.
7. Email delivery state SHALL be durable enough to diagnose requested, sent, delivered, bounced, complained, suppressed, and failed outcomes where available.
8. Resend webhooks SHALL verify signatures, tolerate retries and out-of-order delivery, and deduplicate by provider event identifier.
9. Email payloads and logs SHALL minimize personal and business-sensitive data.
10. Noncritical email failure SHALL NOT roll back a committed inventory transaction; it SHALL be retried asynchronously and surfaced operationally.

## 10. Rate-limiting requirements

### FR-12: Upstash Redis

1. Upstash Redis and `@upstash/ratelimit` SHALL provide distributed limits for Auth-adjacent endpoints, invitations, recovery, public webhooks where applicable, chatbot endpoints, and abuse-sensitive mutations.
2. Limits SHALL use separate namespaces and policies by endpoint/risk class.
3. Identifiers SHALL combine IP, authenticated user ID, and privacy-preserving normalized account identifiers as appropriate.
4. Raw email addresses, tokens, or sensitive identifiers SHALL NOT be stored as Redis keys.
5. Rate-limit failure behavior SHALL be explicit: high-risk authentication/admin mutations fail closed or degrade to a safer path; low-risk reads MAY fail open with monitoring.
6. Warehouse scan throughput SHALL not be constrained by generic public limits; scan endpoints use authenticated, operation-specific limits and idempotency.
7. Responses SHALL provide appropriate retry guidance without exposing internal policy details.
8. Rate-limit analytics and cost SHALL be monitored with an approved retention/privacy policy.

## 11. Background-work requirements

### FR-13: Job execution

1. v1 background work SHALL use a durable PostgreSQL job/outbox model, Supabase Edge Functions for external/service work, and Supabase Cron/`pg_cron` for scheduling and recovery sweeps.
2. Business transactions that require follow-up work SHALL enqueue an outbox/job record in the same database transaction when possible.
3. Jobs SHALL have a stable type, validated payload version, idempotency/deduplication key, correlation ID, attempt count, next-attempt time, status, and timestamps.
4. Workers SHALL claim jobs atomically with a lease so concurrent invocations do not process the same job simultaneously.
5. Job handlers SHALL be idempotent because invocation and webhook delivery may occur more than once.
6. Retries SHALL use bounded exponential backoff with jitter and a maximum attempt count.
7. Permanently failed jobs SHALL enter a dead-letter/failed state visible to authorized operators.
8. Jobs SHALL not exceed provider execution limits; long workflows SHALL be split into resumable steps.
9. Scheduled jobs SHALL be defined in migrations/configuration, use UTC internally, and document their Asia/Manila business-time interpretation.
10. Cron-to-Edge-Function credentials SHALL be stored in Supabase Vault or an equivalent approved secret store.
11. Job execution SHALL preserve original actor, system executor, and correlation metadata where the work originated from a user action.

## 12. Monitoring requirements

### FR-14: Sentry and provider telemetry

1. Sentry SHALL capture unhandled client, server, and edge errors for staging and production.
2. Events SHALL include environment, release/source revision, route or operation name, and correlation ID where safe.
3. Source maps SHALL be uploaded during trusted builds and SHALL not be publicly exposed unnecessarily.
4. Tokens, cookies, authorization headers, passwords, document contents, and unnecessary personal data SHALL be scrubbed before transmission.
5. Session Replay SHALL be disabled by default for authenticated warehouse and administration screens unless separately approved with privacy controls.
6. Performance tracing SHALL use controlled sampling and higher sampling for critical/failed transactions where supported.
7. Alerting SHALL cover elevated error rate, critical workflow failures, job backlog/dead letters, failed migrations/deployments, email delivery failure, and database capacity/availability.
8. Vercel, Supabase, Resend, Upstash, and Sentry dashboards/logs SHALL have documented ownership and diagnostic runbooks.
9. Provider logs SHALL not be treated as the permanent business audit ledger.

### FR-15: Health and correlation

1. The application SHALL expose a minimal health endpoint that does not reveal secrets or detailed infrastructure topology.
2. Readiness checks SHALL distinguish application availability from critical dependency degradation where operationally useful.
3. Requests, jobs, emails, and webhooks SHALL propagate a correlation ID.
4. User-visible errors SHALL provide a safe support/reference code linked to internal telemetry where appropriate.

## 13. Deployment requirements

### FR-16: CI/CD and release gates

1. Pull requests SHALL run formatting/linting, type checking, unit tests, production build, migration reset/apply, real-Postgres integration tests when applicable, and selected Playwright tests.
2. Dependency installation SHALL use a committed lockfile and reproducible command.
3. Database migrations SHALL apply to staging before production.
4. Production migration and deployment SHALL be serialized so two releases cannot mutate schema concurrently.
5. Production promotion SHALL require successful staging verification, migration review, backup/recovery readiness for risky changes, and authorized approval.
6. Secrets SHALL be injected by the deployment platform and SHALL not be written into build artifacts, logs, or repository files.
7. Post-deploy smoke tests SHALL verify sign-in, protected application shell, database read/write health, Storage access, and critical integrations without altering real inventory.
8. Failed application deployment SHALL roll back through Vercel promotion/rollback; failed database changes SHALL use an approved forward-fix or tested recovery procedure.
9. Destructive schema changes SHALL use multi-release expand/migrate/contract and SHALL not be coupled to an irreversible single deployment.

## 14. Backup and recovery requirements

### FR-17: Database and file recovery

1. Production SHALL use a Supabase plan and backup configuration that meets the approved recovery objectives.
2. Point-in-Time Recovery SHOULD be enabled for production before operational inventory data is accepted.
3. Backup status and retention SHALL be reviewed on a scheduled basis.
4. Restore procedures SHALL be tested into an isolated nonproduction project; a listed backup without a tested restore is insufficient.
5. Database backups SHALL be treated separately from Supabase Storage object recovery because database backups do not include stored file contents.
6. Protected Storage objects SHALL have an approved export/replication and recovery procedure before launch.
7. Encryption keys, service credentials, DNS configuration, email-domain records, cron schedules, and environment configuration SHALL have documented recovery/recreation steps.
8. Recovery tests SHALL verify data integrity, RLS, Auth configuration, Storage linkage, scheduled jobs, and application compatibility.
9. Recovery Point Objective (RPO) and Recovery Time Objective (RTO) SHALL be approved before production launch.

## 15. Security and operations requirements

### FR-18: Secrets and access control

1. Provider accounts SHALL use individual identities, least-privilege roles, MFA where supported, and no shared administrator credentials.
2. Production access SHALL be limited to approved operators and reviewed periodically.
3. Service keys SHALL be separated by environment and rotated after exposure, personnel change, or according to the approved schedule.
4. The Supabase service-role key, database passwords, Resend API keys, Upstash tokens, Sentry auth token, webhook secrets, and Vault secrets SHALL never enter browser code.
5. Secret scanning and dependency/security checks SHALL run in CI where tooling is available.
6. Webhooks SHALL validate signatures against the raw request body before parsing or mutating state.
7. Administrative infrastructure actions SHALL be traceable through provider audit logs or an internal change record.

### FR-19: Cost, quotas, and capacity

1. Each paid service SHALL have an owner, plan, billing alert, quota/limit inventory, and expected growth assumption.
2. Production launch SHALL verify database compute/storage, connection limits, Realtime connections/messages, Storage capacity/egress, Edge Function limits, email volume, Upstash commands, Sentry event quota, and Vercel runtime/build limits.
3. Quota exhaustion SHALL degrade safely and SHALL not silently corrupt inventory state.
4. Optional telemetry or realtime features SHALL be sampled/limited before core transactional operations.
5. Cost reviews SHALL occur at least monthly during initial operation and after material volume changes.

### FR-20: Incident and change management

1. Production SHALL have named technical and business incident owners and an escalation path.
2. Runbooks SHALL cover authentication outage, database outage, migration failure, Storage failure, email failure, Upstash failure, Realtime failure, job backlog, leaked credential, and Vercel deployment failure.
3. Incidents SHALL record timeline, impact, decisions, remediation, and follow-up actions.
4. Emergency changes SHALL still be captured in version control and reconciled into normal configuration/migrations immediately after stabilization.
5. Maintenance windows and user communication procedures SHALL be defined for changes that can interrupt warehouse work.

## 16. Service-level objectives and launch gates

The following are approved minimum targets for planning and require operational verification before production:

| Measure | Draft target |
|---|---|
| Monthly application availability | 99.5%, excluding announced maintenance |
| Critical interactive request latency | p95 under 2 seconds under expected load, excluding large file transfer |
| Floor scan acknowledgement | p95 under 1 second online after input submission, excluding external email/job work |
| Database RPO | 15 minutes target with PITR; never more than 24 hours |
| Application/database RTO | 4 hours target |
| Protected file RPO | 24 hours until a stronger replication target is approved |
| Critical alert acknowledgement | 30 minutes during supported operating hours |

Production launch is blocked until:

- Production/staging isolation is verified.
- Auth custom SMTP and sender DNS are verified.
- RLS and service-role boundaries pass review.
- Backup and isolated restore tests pass.
- Storage recovery and untrusted-file policy are approved.
- Critical alerts and runbooks are tested.
- Cost/quota owners and thresholds are recorded.
- Physical warehouse QA required by `testing.md` is complete.

## 17. Acceptance criteria

1. No preview, local, or CI deployment can read production data or use production credentials.
2. A production build fails when required configuration is absent or malformed.
3. Browser bundles contain no server-only secret.
4. Vercel runtime uses the approved serverless-safe Supabase access path and bounded connections.
5. User-scoped reads and writes are denied when RLS identity propagation is absent or invalid.
6. A full local/CI database reset applies all committed migrations in order.
7. Staging receives and validates migrations before production.
8. Auth invitation/recovery emails deliver through verified Resend-backed production SMTP.
9. Repeating the same email/job/webhook event does not duplicate the business effect.
10. Resend webhook requests with invalid signatures are rejected and duplicate deliveries are ignored safely.
11. Upstash outage behavior matches the endpoint's documented fail-open/fail-closed policy.
12. Realtime outage does not prevent authoritative workflow completion or later reconciliation.
13. Sentry captures a controlled test error with release/environment/correlation data and no prohibited secrets or PII.
14. Failed jobs retry, then enter an operator-visible dead-letter state without blocking committed inventory transactions.
15. A database backup can be restored into an isolated environment and pass integrity/RLS smoke tests.
16. Protected Storage objects can be recovered according to the approved procedure.
17. Vercel application rollback and database forward-fix/recovery procedures are exercised in staging.
18. Production provider accounts, secrets, quotas, alerts, and runbook owners are documented.

## 18. Out of scope

- Multi-warehouse infrastructure or `warehouse_id` tenancy.
- Self-hosting Next.js, Supabase, Redis, email, or monitoring services in v1.
- Kubernetes, container orchestration, or a dedicated always-on worker fleet.
- BullMQ in v1 unless a later approved workload requires it.
- Marketing email and customer-engagement campaigns.
- A general analytics warehouse or long-term log lake.
- Vendor-neutral cloud abstraction that hides Supabase or Vercel capabilities.
- Workflow-specific business requirements owned by feature specs `06` through `22`, excluding deferred `19`.

## 19. Decisions required before approval

1. Confirm production Supabase/Vercel plan levels and whether Supabase Branching, PITR, and Vercel custom environments are purchased.
2. **Resolved 2026-08-06:** use the approved RPO/RTO, availability, latency, and support-hours targets in §16; operational verification remains a launch gate.
3. **Resolved 2026-08-06:** select the nearest supported provider region to the Philippine warehouse using measured latency and data-processing constraints.
4. **Resolved 2026-08-06:** use temporary provider-assigned/restricted domains before launch; require a dedicated custom HTTPS production domain, narrow Auth redirects, and verified Resend sender DNS before production.
5. **Resolved 2026-08-06:** use 24-hour sessions with refresh and deactivation revocation; MFA is optional in v1.
6. Select Storage backup/export destination and malware/restricted-file handling.
7. Approve service owners, incident contacts, billing thresholds, and log/audit retention periods.
8. Validate the Drizzle/RLS identity path against the selected Supabase connection mode.

## 20. Official references

Verified 2026-08-04 against vendor documentation:

- [Supabase database connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase deployment and branching](https://supabase.com/docs/guides/deployment)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Vercel environments](https://vercel.com/docs/deployments/environments)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel deployment protection](https://vercel.com/docs/deployment-protection)
- [Upstash Rate Limit](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)
- [Resend domain configuration](https://resend.com/docs/dashboard/domains/introduction)
- [Resend webhooks](https://resend.com/docs/webhooks/introduction)
- [Sentry for Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
