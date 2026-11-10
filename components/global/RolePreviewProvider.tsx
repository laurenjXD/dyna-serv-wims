"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type PreviewGrant = { resource: string; action: string; scopeKind: "global" | "assigned_party" };
type Preview = { roleName: string; grants: PreviewGrant[] } | null;
type RolePreviewContextValue = { preview: Preview; startPreview: (roleName: string, grants: PreviewGrant[]) => void; clearPreview: () => void };

const RolePreviewContext = createContext<RolePreviewContextValue | null>(null);

export function RolePreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<Preview>(null);
  const value = useMemo(() => ({
    preview,
    startPreview: (roleName: string, grants: PreviewGrant[]) => setPreview({ roleName, grants }),
    clearPreview: () => setPreview(null),
  }), [preview]);
  return <RolePreviewContext.Provider value={value}>{children}</RolePreviewContext.Provider>;
}

export function useRolePreview() {
  const value = useContext(RolePreviewContext);
  // Unit-level shell consumers intentionally render without the authenticated
  // layout. An inert fallback keeps that presentation identical to production
  // when no preview provider is mounted.
  return value ?? { preview: null, startPreview: () => {}, clearPreview: () => {} };
}
