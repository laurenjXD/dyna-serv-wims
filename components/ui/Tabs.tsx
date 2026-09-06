"use client";

import React, { createContext, useContext, useState } from "react";

interface TabsContextType {
  activeTab: string;
  setActiveTab: (id: string) => void;
  variant: "pills" | "underline" | "enclosed";
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  variant?: "pills" | "underline" | "enclosed";
  children: React.ReactNode;
  className?: string;
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  variant = "pills",
  children,
  className = "",
}: TabsProps) {
  const [internalTab, setInternalTab] = useState(defaultValue);
  const activeTab = value !== undefined ? value : internalTab;

  const handleTabChange = (newTab: string) => {
    if (value === undefined) {
      setInternalTab(newTab);
    }
    if (onValueChange) {
      onValueChange(newTab);
    }
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab: handleTabChange, variant }}>
      <div className={`w-full ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("TabList must be used within Tabs");

  const listStyles = {
    pills: "bg-slate-100 p-1 rounded-xl gap-1 inline-flex",
    underline: "border-b border-border gap-6 flex",
    enclosed: "border-b border-border flex gap-2",
  };

  return (
    <div
      role="tablist"
      className={`items-center overflow-x-auto ${listStyles[context.variant]} ${className}`}
    >
      {children}
    </div>
  );
}

export function TabTrigger({
  value,
  children,
  icon,
  badge,
  disabled,
  className = "",
}: {
  value: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("TabTrigger must be used within Tabs");

  const isActive = context.activeTab === value;

  let triggerStyles = "";
  if (context.variant === "pills") {
    triggerStyles = isActive
      ? "bg-white text-text-primary shadow-xs font-bold"
      : "text-text-secondary hover:text-text-primary font-medium hover:bg-white/50";
  } else if (context.variant === "underline") {
    triggerStyles = isActive
      ? "border-b-2 border-primary text-primary font-bold pb-3 -mb-px"
      : "border-b-2 border-transparent text-text-secondary hover:text-text-primary font-medium pb-3 -mb-px";
  } else if (context.variant === "enclosed") {
    triggerStyles = isActive
      ? "border-t-2 border-x-2 border-border bg-white text-text-primary font-bold rounded-t-lg -mb-px px-4 py-2.5"
      : "text-text-secondary hover:text-text-primary font-medium px-4 py-2.5";
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => context.setActiveTab(value)}
      className={`inline-flex items-center gap-2 text-xs sm:text-sm transition-all duration-150 rounded-lg px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 select-none ${triggerStyles} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
      {badge && <span className="shrink-0">{badge}</span>}
    </button>
  );
}

export function TabContent({
  value,
  children,
  className = "",
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("TabContent must be used within Tabs");

  if (context.activeTab !== value) return null;

  return (
    <div role="tabpanel" className={`pt-4 animate-in fade-in duration-150 ${className}`}>
      {children}
    </div>
  );
}
