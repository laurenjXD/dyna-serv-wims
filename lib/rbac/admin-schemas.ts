import { z } from "zod";

export const roleGrantSchema = z.object({
  permissionId: z.string().uuid(),
  scopeKind: z.enum(["global", "assigned_party"]),
}).strict();

export const saveRoleSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,99}$/, "Use a role key with lowercase letters, numbers, and underscores"),
  name: z.string().trim().min(2).max(255),
  description: z.string().trim().max(2000),
  grants: z.array(roleGrantSchema).max(500),
  reason: z.string().trim().min(3, "Enter a reason for this access change").max(1000),
}).strict().superRefine((value, ctx) => {
  const keys = value.grants.map((grant) => `${grant.permissionId}:${grant.scopeKind}`);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["grants"], message: "Duplicate permission grants are not allowed" });
});

export const replaceUserRolesSchema = z.object({
  userId: z.string().uuid(),
  roleIds: z.array(z.string().uuid()).max(100),
  reason: z.string().trim().min(3).max(1000),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.roleIds).size !== value.roleIds.length) ctx.addIssue({ code: "custom", path: ["roleIds"], message: "Duplicate role assignments are not allowed" });
});

export const roleChangeSchema = z.object({
  roleId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export type SaveRoleInput = z.infer<typeof saveRoleSchema>;
