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
// Contact Party Email Composer Modal
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import {
  EMAIL_TEMPLATES,
  generateBrandedEmailHtml,
} from "@/lib/notifications/email-composer-templates";
import {
  Mail,
  FileText,
  Paperclip,
  Trash2,
  Eye,
  Edit3,
  CheckCircle2,
  X,
  AlertCircle,
  Sparkles,
} from "lucide-react";

function ContactPartyModal({
  partyId,
  partyName = "Partner Organization",
  partyEmail,
  contactPerson,
  onClose,
}: {
  partyId: string;
  partyName?: string;
  partyEmail?: string;
  contactPerson?: string;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    contactPartyAction,
    {},
  );

  const [activeTab, setActiveTab] = useState<"compose" | "preview">("compose");
  const [selectedTemplateId, setSelectedTemplateId] = useState("custom_message");
  const [subject, setSubject] = useState("Message from Dyna-Serv Operations");
  const [message, setMessage] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const draftKey = `wims_email_draft_${partyId}`;

  // Load draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.subject) setSubject(parsed.subject);
        if (parsed.message) setMessage(parsed.message);
        if (parsed.templateId) setSelectedTemplateId(parsed.templateId);
        if (parsed.savedAt) setLastSavedTime(parsed.savedAt);
      } else {
        // default to custom template
        const customTmpl = EMAIL_TEMPLATES.find((t) => t.id === "custom_message");
        if (customTmpl) {
          setSubject(customTmpl.defaultSubject);
          setMessage(customTmpl.defaultBody);
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }, [draftKey]);

  // Auto-save draft on change
  useEffect(() => {
    if (!message && !subject) return;
    const timer = setTimeout(() => {
      try {
        const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            subject,
            message,
            templateId: selectedTemplateId,
            savedAt: now,
          })
        );
        setLastSavedTime(now);
      } catch {
        // ignore
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [subject, message, selectedTemplateId, draftKey]);

  // Clear draft on successful send
  useEffect(() => {
    if (state.ok) {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
    }
  }, [state.ok, draftKey]);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tmpl = EMAIL_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      setSubject(tmpl.defaultSubject);
      setMessage(tmpl.defaultBody);
    }
  };

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
      const customTmpl = EMAIL_TEMPLATES.find((t) => t.id === "custom_message");
      if (customTmpl) {
        setSelectedTemplateId("custom_message");
        setSubject(customTmpl.defaultSubject);
        setMessage(customTmpl.defaultBody);
      } else {
        setSubject("");
        setMessage("");
      }
      setLastSavedTime(null);
    } catch {
      // ignore
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const selectedTemplate = EMAIL_TEMPLATES.find((t) => t.id === selectedTemplateId);
  const previewHtml = generateBrandedEmailHtml({
    partyName,
    contactPerson,
    subject: subject || "Message from Dyna-Serv Operations",
    templateCategory: selectedTemplate?.category ?? "general",
    messageBody: message || "Type a message in the Compose tab to preview the email formatting...",
    attachmentNames: attachedFiles.map((f) => f.name),
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-party-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface shadow-elevation-3 overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-border bg-surface-light-grey/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="contact-party-title"
                className="font-heading text-title-md font-bold text-on-surface"
              >
                Transactional Email Dispatch
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 font-body text-body-xs text-text-grey">
                <span>To: <strong className="text-on-surface">{partyName}</strong> ({partyEmail || "on record"})</span>
                <span>•</span>
                <span>From: <code className="font-mono text-brand-navy">operations@dyna-serv.com</code></span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-grey hover:bg-surface-light-grey hover:text-on-surface transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {state.error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-brand-red/30 bg-brand-red/5 p-4 font-body text-body-sm text-brand-red"
            >
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Delivery Warning</strong>
                <span>{state.error}</span>
              </div>
            </div>
          )}

          {state.ok ? (
            <div className="py-8 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-available/10 text-status-available">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-heading text-title-md font-bold text-on-surface">
                  Email Successfully Dispatched
                </h3>
                <p className="mt-1 font-body text-body-sm text-text-grey max-w-md mx-auto">
                  Your message and attached documents have been handed off to Resend for instant transactional delivery to {partyName}.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-brand-navy px-6 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <form action={formAction} id="email-dispatch-form" className="space-y-4">
              <input type="hidden" name="partyId" value={partyId} />
              <input type="hidden" name="templateKey" value={selectedTemplateId} />
              <input type="hidden" name="templateCategory" value={selectedTemplate?.category ?? "general"} />

              {/* Template Selector & Composer Controls Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-light-grey/60 p-3">
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                  <Sparkles size={16} className="text-brand-navy shrink-0" />
                  <label htmlFor="template-selector" className="font-label text-label-xs font-bold uppercase text-text-grey shrink-0">
                    Template:
                  </label>
                  <select
                    id="template-selector"
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-border bg-surface px-3 font-body text-body-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    {EMAIL_TEMPLATES.map((tmpl) => (
                      <option key={tmpl.id} value={tmpl.id}>
                        {tmpl.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tab Switcher: Compose vs Live Preview */}
                <div className="flex items-center rounded-lg border border-border bg-surface p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("compose")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-label text-label-xs font-bold transition-colors ${
                      activeTab === "compose"
                        ? "bg-brand-navy text-white shadow-xs"
                        : "text-text-grey hover:text-on-surface"
                    }`}
                  >
                    <Edit3 size={13} />
                    <span>Compose</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("preview")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-label text-label-xs font-bold transition-colors ${
                      activeTab === "preview"
                        ? "bg-brand-navy text-white shadow-xs"
                        : "text-text-grey hover:text-on-surface"
                    }`}
                  >
                    <Eye size={13} />
                    <span>Live Preview</span>
                  </button>
                </div>
              </div>

              {activeTab === "compose" ? (
                <div className="space-y-4">
                  {/* Subject Line */}
                  <div>
                    <label
                      htmlFor="email-subject"
                      className="block font-label text-label-xs font-bold uppercase tracking-wider text-text-grey"
                    >
                      Email Subject Line <span className="text-brand-red">*</span>
                    </label>
                    <input
                      id="email-subject"
                      name="subject"
                      type="text"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Enter email subject line…"
                      className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3.5 font-body text-body-md font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    />
                  </div>

                  {/* Message Body */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="email-message"
                        className="block font-label text-label-xs font-bold uppercase tracking-wider text-text-grey"
                      >
                        Message Body <span className="text-brand-red">*</span>
                      </label>
                      {lastSavedTime && (
                        <span className="font-body text-body-xs text-text-grey italic">
                          Draft auto-saved at {lastSavedTime}
                        </span>
                      )}
                    </div>
                    <textarea
                      id="email-message"
                      name="message"
                      rows={7}
                      required
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Write your operational message to the organization here…"
                      className="mt-1 block w-full rounded-xl border border-border bg-surface p-3.5 font-body text-body-sm text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy leading-relaxed"
                    />
                  </div>

                  {/* File Upload / Attachments Area */}
                  <div>
                    <label className="block font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
                      Attachments (PDF, Images, Excel up to 10MB)
                    </label>

                    <input
                      ref={fileInputRef}
                      type="file"
                      name="files"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-dashed border-border bg-surface-light-grey/40 px-3.5 font-label text-label-xs font-bold text-brand-navy hover:border-brand-navy hover:bg-brand-navy/5 transition-all"
                      >
                        <Paperclip size={14} />
                        <span>Add Attachment</span>
                      </button>

                      {attachedFiles.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 font-body text-body-xs shadow-xs"
                        >
                          <FileText size={13} className="text-brand-navy" />
                          <span className="max-w-[150px] truncate font-medium text-on-surface">
                            {file.name}
                          </span>
                          <span className="text-[10px] text-text-grey">
                            ({(file.size / 1024).toFixed(0)} KB)
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            className="ml-1 text-text-grey hover:text-brand-red transition-colors"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Live HTML Preview Container */
                <div className="rounded-xl border border-border bg-surface-light-grey/30 p-2">
                  <div className="mb-2 flex items-center justify-between px-2 text-text-grey text-[11px] font-label uppercase font-semibold">
                    <span>Simulated Recipient Inbox View</span>
                    <span className="text-emerald-700 font-bold">● Brand Compliant</span>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border bg-white shadow-xs max-h-[420px] overflow-y-auto">
                    <iframe
                      srcDoc={previewHtml}
                      title="Email Preview"
                      className="w-full min-h-[380px] border-0"
                    />
                  </div>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Modal Footer */}
        {!state.ok && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-light-grey/40 px-6 py-4">
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="flex items-center gap-1.5 text-text-grey hover:text-brand-red font-label text-label-xs font-semibold transition-colors"
            >
              <Trash2 size={13} />
              <span>Discard Draft</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 font-label text-label-xs font-bold text-on-surface hover:bg-surface-light-grey transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="email-dispatch-form"
                disabled={isPending}
                className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-label text-label-xs font-bold text-surface-white hover:bg-primary-hover active:scale-95 shadow-sm transition-all disabled:opacity-50"
              >
                <Mail size={14} />
                <span>{isPending ? "Sending via Resend…" : "Send Email Dispatch"}</span>
              </button>
            </div>
          </div>
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
  partyName?: string;
  partyEmail?: string;
  contactPerson?: string;
  roles: PartyRoleRow[];
  canManage: boolean;
  hasEmail: boolean;
}

export function PartyDetailActions({
  partyId,
  partyName,
  partyEmail,
  contactPerson,
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
            className="font-heading font-semibold text-data-display text-on-surface"
          >
            Business Roles
          </h3>
          {canManage && hasEmail && (
            <button
              type="button"
              onClick={() => setShowContactModal(true)}
              className="flex h-11 items-center gap-2 rounded-lg bg-brand-navy px-4 font-label text-label font-bold text-surface-white hover:bg-brand-royal-blue active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-red transition-all shadow-xs"
            >
              <Mail size={16} />
              <span>Contact Organization</span>
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
          partyName={partyName}
          partyEmail={partyEmail}
          contactPerson={contactPerson}
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
        Organization has been deactivated. Reload the page to see the updated status.
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
          Deactivate Organization
        </button>
      ) : (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={partyId} />
          <p className="font-body text-body-md text-on-surface">
            Deactivate this organization? This cannot be undone through this form.
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
            className="flex h-11 items-center justify-center rounded-lg bg-primary px-5 font-label text-label font-semibold tracking-wide text-surface-white shadow-sm transition-all hover:brightness-95 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
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
