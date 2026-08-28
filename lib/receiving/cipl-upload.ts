// Pure business logic for CIPL file uploads (filename sanitization, MIME/
// size validation, object path construction) — no Storage/DB access, so the
// call site (lib/actions/receiving.ts's uploadCiplFile) stays a thin wrapper.
//
// Traceability:
//   specs/04-services-and-infrastructure/design.md §10.1 (bucket plan —
//     `cipl-documents`), §10.2 (object path convention: "sanitized-filename
//     strips path separators, control characters, and non-ASCII characters
//     and is truncated to 120 characters"; named path
//     `cipl/{wrr_id}/{upload_uuid}/{sanitized-filename}`), §10.3 (upload
//     flow step 2: "Validate declared MIME, extension, and size").
//   lib/db/schema/wrr.ts — ciplFileUrl column comment: "Attached PDF/Image
//     CIPL document in Supabase Storage".
//   supabase/migrations/0030_cipl_documents_storage.sql — bucket's own
//     file_size_limit/allowed_mime_types mirror the constants below.

export const CIPL_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const CIPL_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
] as const;

export function sanitizeFilename(name: string): string {
  const stripped = name
    .replace(/[\\/]/g, "_") // path separators
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "") // control characters
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7e]/g, ""); // non-ASCII
  const trimmed = stripped.trim();
  return (trimmed === "" ? "file" : trimmed).slice(0, 120);
}

export type CiplFileValidation = { ok: true } | { ok: false; error: string };

export function validateCiplFile(file: {
  type: string;
  size: number;
}): CiplFileValidation {
  if (!(CIPL_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "Only PDF, PNG, or JPEG files are accepted." };
  }
  if (file.size <= 0) {
    return { ok: false, error: "The selected file is empty." };
  }
  if (file.size > CIPL_MAX_BYTES) {
    return { ok: false, error: "File exceeds the 10MB size limit." };
  }
  return { ok: true };
}

export function buildCiplObjectPath(
  wrrId: string,
  uploadUuid: string,
  filename: string,
): string {
  return `cipl/${wrrId}/${uploadUuid}/${sanitizeFilename(filename)}`;
}
