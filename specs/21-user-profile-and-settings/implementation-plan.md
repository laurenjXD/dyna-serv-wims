# Settings Functional-Gap Implementation Plan

Status: In progress
Source: Approved `requirements.md`, `design.md`, and `tasks.md`

## Phase 1 — Durable contracts and safe persistence

- Validate General and Security payloads server-side with Zod.
- Deep-merge legacy/partial General settings so old rows cannot crash the form.
- Persist Security settings in `system_settings` under `security`; retain audit records as immutable history, not as the primary configuration store.
- Validate IP ranges, password bounds, session bounds, email, document, and threshold values.

## Phase 2 — Effective General settings

- Make document-template and low-stock consumers read the effective General settings.
- Provide scanner settings through the authenticated shell so every camera scanner uses the same decoder and feedback policy.
- Preserve the approved duplicate-scan pause even when “Continuous Stream” is enabled.
- Wire supported QR/DataMatrix/Code 128 formats, haptic feedback, and audio feedback.
- Add capability-aware handling for browser/device features that cannot be guaranteed, especially torch and tap-to-focus.
- Resolve or explicitly disable email, quarantine-alert, and scheduled-PDF controls until their delivery workers exist; never present a saved-but-ignored control as active.

## Phase 3 — Effective Security enforcement

- Read policy independently of admin-page authorization at operational enforcement points.
- Enforce warehouse-network policy before receiving, picking, and dispatch mutations.
- Enforce configured password minimum/special-character policy during password change and invitation acceptance.
- Keep Supabase Auth authoritative for MFA/session lifecycle; expose settings only where the configured policy can be enforced.
- Make session idle thresholds affect session enforcement, not only display labels.
- Keep emergency mobile-session termination auditable and idempotent.

## Phase 4 — Team/RBAC and UX consistency

- Ensure invite, suspend, reactivate, resend, cancel, role, scope, audit, and revoke actions show success/error states.
- Use the shared What / Why / Next Action state contract for settings errors, empty results, stale data, and unavailable providers.
- Preserve Organization terminology in user-facing labels while retaining canonical database identifiers.
- Prevent stale filters/pages after team mutations and surface refresh failures.

## Phase 5 — Verification

- Unit-test validation and policy helpers.
- Test settings persistence/reload against real Postgres where database behavior is involved.
- Test receiving/picking/dispatch network denial and approved-network paths.
- Test settings-page controls with Playwright at office and mobile widths.
- Run typecheck, unit tests, integration tests, build, and targeted E2E before marking complete.

## Current implementation status

Completed: Phase 1; Phase 3 network/password enforcement; Phase 2 document/low-stock existing consumers and scanner decoder/feedback wiring; Team reactivation error feedback.

Remaining: scheduled/email/quarantine delivery controls, browser capability-specific scanner controls, true session idle enforcement, MFA policy enforcement boundary, and full settings Playwright coverage.
