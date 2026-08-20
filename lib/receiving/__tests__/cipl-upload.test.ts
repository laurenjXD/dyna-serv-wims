// Unit tests for lib/receiving/cipl-upload.ts's pure logic.
//
// Traceability: specs/04-services-and-infrastructure/design.md §10.2
// (object path convention, sanitized-filename rules) and §10.3 (upload
// flow step 2: validate declared MIME, extension, and size).

import { describe, expect, it } from "vitest";
import {
  sanitizeFilename,
  validateCiplFile,
  buildCiplObjectPath,
  CIPL_MAX_BYTES,
} from "../cipl-upload";

describe("sanitizeFilename", () => {
  it("strips path separators", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(sanitizeFilename("a\\b\\c.pdf")).toBe("a_b_c.pdf");
  });

  it("strips control characters", () => {
    expect(sanitizeFilename("file\x00name.pdf")).toBe("filename.pdf");
  });

  it("strips non-ASCII characters", () => {
    expect(sanitizeFilename("CIPL-café-日本語.pdf")).toBe("CIPL-caf-.pdf");
  });

  it("truncates to 120 characters", () => {
    const long = "a".repeat(200) + ".pdf";
    const result = sanitizeFilename(long);
    expect(result.length).toBe(120);
  });

  it("falls back to 'file' when nothing survives sanitization", () => {
    expect(sanitizeFilename("日本語.pdf".slice(0, 3))).toBe("file");
  });
});

describe("validateCiplFile", () => {
  it("accepts a valid PDF within size limits", () => {
    expect(validateCiplFile({ type: "application/pdf", size: 1024 })).toEqual({ ok: true });
  });

  it("accepts PNG and JPEG", () => {
    expect(validateCiplFile({ type: "image/png", size: 1024 })).toEqual({ ok: true });
    expect(validateCiplFile({ type: "image/jpeg", size: 1024 })).toEqual({ ok: true });
  });

  it("rejects an unsupported MIME type", () => {
    const result = validateCiplFile({ type: "application/zip", size: 1024 });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty file", () => {
    const result = validateCiplFile({ type: "application/pdf", size: 0 });
    expect(result.ok).toBe(false);
  });

  it("rejects a file exceeding the 10MB limit", () => {
    const result = validateCiplFile({ type: "application/pdf", size: CIPL_MAX_BYTES + 1 });
    expect(result.ok).toBe(false);
  });

  it("accepts a file exactly at the size limit", () => {
    expect(validateCiplFile({ type: "application/pdf", size: CIPL_MAX_BYTES })).toEqual({ ok: true });
  });
});

describe("buildCiplObjectPath", () => {
  it("builds the path per specs/04 §10.2: cipl/{wrr_id}/{upload_uuid}/{sanitized-filename}", () => {
    const path = buildCiplObjectPath(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "packing list.pdf",
    );
    expect(path).toBe(
      "cipl/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/packing list.pdf",
    );
  });

  it("sanitizes the filename component", () => {
    const path = buildCiplObjectPath("wrr-1", "upload-1", "../evil.pdf");
    expect(path).toBe("cipl/wrr-1/upload-1/.._evil.pdf");
  });
});
