"use client";

import { useEffect, useState, type ReactNode } from "react";

const DISMISS_AFTER_MS = 3_000;

export function AutoDismissNotice({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setVisible(false), DISMISS_AFTER_MS);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!visible) return null;
  return <>{children}</>;
}
