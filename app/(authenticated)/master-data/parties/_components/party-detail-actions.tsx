"use client";

// Client-side interactive sections on the party detail page:
//   1. Role management (add / remove)
//   2. Contact Party modal composer
//
// Both sections run within the same component to keep related state co-located.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §5 (party_roles), §5a (Contact Party)
//   specs/00-steering/brand-design-system.md §9 (buttons, modals)

import { useActionState, useState } from "react";
import {
  addPartyRoleAction,
  removePartyRoleAction,
  contactPartyAction,
  deactivatePartyAction,
} from "../_actions";
import type { PartyFormState } from "../_actions";
import type { PartyRoleRow } from "@/lib/db/queries/parties";

const PARTY_ROLES = [
  { value: "vendor", label: "Vendor" },
  { value: "supplier", label: "Supplier" },
  { value: "customer", label: "Customer" },
  { value: "end_customer", label: "End Customer" },
  { value: "internal_warehouse", label: "Internal Warehouse" },
] as const;

// ---------------------------------------------------------------------------
// Role tag with remove button
// ---------------------------------------------------------------------------

function RoleTag({
  partyId,
  role,
  canManage,
}: {
  partyId: string;
  role: PartyRoleRow;
  canManage: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    removePartyRoleAction,
    {},
  );

  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-surface-light-grey px-3 py-1">
      <span className="font-label text-label text-on-surface capitalize">
        {role.role.replace(/_/g, " ")}
      </span>
      {canManage && (
        <form action={formAction}>
          <input type="hidden" name="partyId" value={partyId} />
          <input type="hidden" name="roleRowId" value={role.id} />
          <button
            type="submit"
            disabled={isPending}
            aria-label={`Remove ${role.role} role`}
            className="ml-1 flex h-11 w-11 items-center justify-center rounded text-text-grey hover:text-status-held focus:outline-none focus:ring-2 focus:ring-status-held disabled:opacity-50"
          >
            ×
          </button>
        </form>
      )}
      {state.error && (
        <span className="sr-only" role="alert">
          {state.error}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Add Role form
// ---------------------------------------------------------------------------

function AddRoleForm({
  partyId,
  existingRoles,
}: {
  partyId: string;
  existingRoles: string[];
}) {
  const [state, formAction, isPending] = useActionState(addPartyRoleAction, {});
  const availableRoles = PARTY_ROLES.filter(
    (r) => !existingRoles.includes(r.value),
  );

  if (availableRoles.length === 0) return null;

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="partyId" value={partyId} />
      <div>
        <label
          htmlFor="role-select"
          className="block font-label text-label text-on-surface"
        >
          Add Role
        </label>
        <select
          id="role-select"
          name="role"
          required
          className="mt-1 h-11 rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          <option value="">Select role…</option>
          {availableRoles.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-red disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add"}
      </button>
      {state.error && (
        <p role="alert" className="font-body text-body-sm text-brand-red">
          {state.error}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Contact Party Modal
// ---------------------------------------------------------------------------

function ContactPartyModal({
  partyId,
  onClose,
}: {
  partyId: string;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    contactPartyAction,
    {},
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-party-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 px-4"
    >
      <div className="w-full max-w-lg rounded-md bg-surface-white shadow-elevation-2 p-6">
        <h2
          id="contact-party-title"
          className="font-heading font-semibold text-headline-md text-brand-navy"
        >
          Contact Party
        </h2>
        <p className="mt-2 font-body text-body-md text-text-grey">
          This will send an operational notification from Dyna-Serv Operations
          to the party&apos;s email address on record. The message is sent from
          the Dyna-Serv system — not from your personal inbox.
        </p>

        {state.error && (
          <div
            role="alert"
            className="mt-4 rounded border border-brand-red/30 bg-brand-red/5 px-4 py-3 font-body text-body-md text-brand-red"
          >
            {state.error}
          </div>
        )}

        {state.ok ? (
          <div className="mt-4">
            <p className="font-body text-body-md text-status-available">
              Notification sent successfully.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 flex h-11 items-center justify-center rounded bg-brand-navy px-6 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-red"
            >
              Close
            </button>
          </div>
        ) : (
          <form action={formAction} className="mt-4">
            <input type="hidden" name="partyId" value={partyId} />
            <div>
              <label
                htmlFor="contact-message"
                className="block font-label text-label text-on-surface"
              >
                Additional Message{" "}
                <span className="font-body text-body-sm text-text-grey">
                  (optional)
                </span>
              </label>
              <textarea
                id="contact-message"
                name="message"
                rows={4}
                placeholder="Add any additional context here…"
                className="mt-1 block w-full rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 items-center justify-center rounded bg-brand-navy px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="btn-diagonal-cut flex h-11 items-center justify-center rounded bg-brand-red px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
              >
                {isPending ? "Sending…" : "Send Notification"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PartyDetailActions — exported composite component
// ---------------------------------------------------------------------------

export interface PartyDetailActionsProps {
  partyId: string;
  roles: PartyRoleRow[];
  canManage: boolean;
  hasEmail: boolean;
}

export function PartyDetailActions({
  partyId,
  roles,
  canManage,
  hasEmail,
}: PartyDetailActionsProps) {
  const [showContactModal, setShowContactModal] = useState(false);

  return (
    <>
      {/* Business Roles section */}
      <section aria-labelledby="roles-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3
            id="roles-heading"
            className="font-heading font-semibold text-data-display text-brand-navy"
          >
            Business Roles
          </h3>
          {canManage && hasEmail && (
            <button
              type="button"
              onClick={() => setShowContactModal(true)}
              className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-red"
            >
              Contact Party
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {roles.length === 0 ? (
            <p className="font-body text-body-md text-text-grey">
              No business roles assigned.
            </p>
          ) : (
            roles.map((role) => (
              <RoleTag
                key={role.id}
                partyId={partyId}
                role={role}
                canManage={canManage}
              />
            ))
          )}
        </div>

        {canManage && (
          <div className="mt-4">
            <AddRoleForm
              partyId={partyId}
              existingRoles={roles.map((r) => r.role)}
            />
          </div>
        )}
      </section>

      {/* Contact Party modal */}
      {showContactModal && (
        <ContactPartyModal
          partyId={partyId}
          onClose={() => setShowContactModal(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// DeactivatePartySection — self-contained client component, importable from
// server component pages.
// ---------------------------------------------------------------------------

export function DeactivatePartySection({ partyId }: { partyId: string }) {
  const [state, formAction, isPending] = useActionState<PartyFormState, FormData>(
    deactivatePartyAction,
    {},
  );
  const [confirmed, setConfirmed] = useState(false);

  if (state.ok) {
    return (
      <p className="font-body text-body-md text-status-available">
        Party has been deactivated. Reload the page to see the updated status.
      </p>
    );
  }

  return (
    <div>
      {!confirmed ? (
        <button
          type="button"
          onClick={() => setConfirmed(true)}
          className="flex h-11 items-center justify-center rounded border border-status-held px-4 font-label text-label text-status-held hover:bg-status-held/5 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-status-held"
        >
          Deactivate Party
        </button>
      ) : (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={partyId} />
          <p className="font-body text-body-md text-on-surface">
            Deactivate this party? This cannot be undone through this form.
          </p>
          <button
            type="button"
            onClick={() => setConfirmed(false)}
            className="flex h-11 items-center px-2 font-label text-label text-text-grey underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex h-11 items-center justify-center rounded bg-status-held px-4 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-status-held"
          >
            {isPending ? "Deactivating…" : "Confirm Deactivate"}
          </button>
        </form>
      )}
      {state.error && (
        <p role="alert" className="mt-2 font-body text-body-sm text-brand-red">
          {state.error}
        </p>
      )}
    </div>
  );
}
