import type { ReactNode } from "react";

export function DetailPageHeader({
  breadcrumb,
  title,
  subtitle,
  actions,
  badges,
}: {
  breadcrumb: ReactNode;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <header className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {breadcrumb}
          <h1 className="mt-1 font-heading text-2xl font-extrabold text-on-surface sm:text-3xl">{title}</h1>
          {subtitle && <div className="mt-1 font-body text-sm text-text-grey">{subtitle}</div>}
          {badges && <div className="mt-4 flex flex-wrap items-center gap-2">{badges}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function DetailCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function DetailSectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-heading text-xl font-bold text-on-surface">{title}</h2>
        {description && <p className="mt-1 font-body text-sm text-text-grey">{description}</p>}
      </div>
      {action}
    </div>
  );
}
