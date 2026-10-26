import type { ReactNode } from "react";

export interface MobileDataCardField {
  label: string;
  value: ReactNode;
  className?: string;
}

interface MobileDataCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  fields?: MobileDataCardField[];
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Canonical mobile replacement for dense office tables. */
export function MobileDataCard({
  title,
  subtitle,
  badge,
  fields = [],
  actions,
  children,
  className = "",
}: MobileDataCardProps) {
  return (
    <article className={`min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-elevation-1 ${className}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-heading text-base font-bold text-text-primary">{title}</h3>
          {subtitle && <p className="mt-1 break-words font-body text-sm text-text-secondary">{subtitle}</p>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      {fields.length > 0 && (
        <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 border-t border-border pt-3">
          {fields.map((field) => (
            <div key={field.label} className={`min-w-0 ${field.className ?? ""}`}>
              <dt className="font-label text-xs font-bold uppercase tracking-wide text-text-secondary">{field.label}</dt>
              <dd className="mt-1 min-w-0 break-words font-body text-base text-text-primary">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      {actions && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">{actions}</div>}
    </article>
  );
}

export function MobileDataCardList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid min-w-0 gap-3 p-3 ${className}`}>{children}</div>;
}
