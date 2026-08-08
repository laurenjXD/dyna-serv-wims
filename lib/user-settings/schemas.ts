// Zod validation schemas for the User Profile & Settings module.
//
// Traceability: specs/21-user-profile-and-settings/design.md §3.1 (invite
// schema shape and the conditional party_id superRefine) and
// requirements.md NFR-2 ("All inputs in the profile and settings forms MUST
// be validated using Zod schemas before submission to the server").
//
// The role enum here uses `02-rbac-roles`' real role keys
// (lib/user-settings/roles.ts's SystemRoleKey), not design.md §3.1's literal
// `"admin"` — see roles.ts's header comment for why.

import { z } from "zod";

export const SYSTEM_ROLE_KEYS = [
  "administrator",
  "supervisor",
  "warehouse_staff",
  "party_user",
] as const;

export const inviteUserSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    displayName: z.string().min(2, "Name must be at least 2 characters"),
    role: z.enum(SYSTEM_ROLE_KEYS),
    partyId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "party_user" && !data.partyId) {
      ctx.addIssue({
        code: "custom",
        message: "A Party Client must be assigned to a specific Party (Vendor/Customer).",
        path: ["partyId"],
      });
    }
  });

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const displayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(255, "Name is too long"),
});

export type DisplayNameInput = z.infer<typeof displayNameSchema>;

// Supabase Auth enforces its own password strength policy server-side; this
// mirrors only the baseline client-facing validation (design.md NFR-2 —
// validate before the request leaves the browser, not a replacement for
// Supabase's own policy check).
export const changePasswordSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const suspendUserSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(1, "A reason is required to suspend a user"),
});

export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
