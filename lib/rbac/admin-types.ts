export interface EffectiveGrant {
  permissionId: string;
  resource: string;
  action: string;
  scopeKind: "global" | "assigned_party";
}

export interface PermissionOption extends EffectiveGrant {
  description: string | null;
}

export interface UserAccess {
  roleIds: string[];
  grants: EffectiveGrant[];
}
