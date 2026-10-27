import React, { forwardRef } from "react";

export interface PageRootProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: "office" | "floor" | "party";
}

export const PageRoot = forwardRef<HTMLDivElement, PageRootProps>(
  ({ surface, className = "", children, ...props }, ref) => (
    <div
      ref={ref}
      data-testid="page-root"
      data-ui="page-root"
      data-page-surface={surface}
      className={`min-w-0 w-full ${className}`}
      {...props}
    >
      {children}
    </div>
  ),
);

PageRoot.displayName = "PageRoot";

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: "office" | "floor" | "party";
}

export const PageContainer = forwardRef<HTMLDivElement, PageContainerProps>(
  ({ surface = "office", className = "", children, ...props }, ref) => (
    <div
      ref={ref}
      data-testid="page-container"
      data-ui="page-container"
      data-page-surface={surface}
      className={`mx-auto w-full max-w-container ${surface === "floor" ? "px-floor-padding" : "px-0"} ${className}`}
      {...props}
    >
      {children}
    </div>
  ),
);

PageContainer.displayName = "PageContainer";

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader = forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ eyebrow, title, description, actions, className = "", ...props }, ref) => (
    <header
      ref={ref}
      data-ui="page-header"
      className={`flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 font-label text-label font-bold uppercase tracking-[0.12em] text-text-secondary">
            {eyebrow}
          </div>
        )}
        <h1 className="font-heading text-headline-lg font-bold tracking-tight text-heading">{title}</h1>
        {description && (
          <p className="mt-2 max-w-3xl font-body text-body-md text-text-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  ),
);

PageHeader.displayName = "PageHeader";

export interface PageSectionProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageSection = forwardRef<HTMLElement, PageSectionProps>(
  ({ title, description, actions, className = "", children, ...props }, ref) => (
    <section ref={ref} data-ui="page-section" className={`space-y-4 ${className}`} {...props}>
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {title && <h2 className="font-heading text-headline-md font-semibold text-heading">{title}</h2>}
            {description && <p className="mt-1 font-body text-body-md text-text-secondary">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  ),
);

PageSection.displayName = "PageSection";

export function MegaCard({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-ui="mega-card"
      data-testid="mega-card"
      className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-elevation-1 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
