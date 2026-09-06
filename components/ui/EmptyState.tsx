import React from "react";
import { Inbox } from "lucide-react";
import { Button, ButtonProps } from "./Button";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
    variant?: ButtonProps["variant"];
    leftIcon?: React.ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  surface?: "office" | "floor";
  className?: string;
  children?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  surface = "office",
  className = "",
  children,
}: EmptyStateProps) {
  const isFloor = surface === "floor";

  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-2xl ${
        isFloor
          ? "bg-white/5 border border-dashed border-white/20 text-white"
          : "bg-surface border border-dashed border-border text-text-primary"
      } ${className}`}
    >
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-2xs ${
          isFloor
            ? "bg-white/10 text-white border border-white/20"
            : "bg-primary/10 text-primary border border-primary/20"
        }`}
      >
        {icon || <Inbox className="w-7 h-7" />}
      </div>

      <h3
        className={`font-heading text-lg font-bold tracking-tight mb-1.5 ${
          isFloor ? "text-white" : "text-text-primary"
        }`}
      >
        {title}
      </h3>

      {description && (
        <p
          className={`font-body text-sm max-w-md mb-6 leading-relaxed ${
            isFloor ? "text-white/70" : "text-text-secondary"
          }`}
        >
          {description}
        </p>
      )}

      {children}

      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {action && (
            action.href ? (
              <a href={action.href}>
                <Button
                  variant={action.variant || (isFloor ? "floor-primary" : "primary")}
                  leftIcon={action.leftIcon}
                >
                  {action.label}
                </Button>
              </a>
            ) : (
              <Button
                variant={action.variant || (isFloor ? "floor-primary" : "primary")}
                onClick={action.onClick}
                leftIcon={action.leftIcon}
              >
                {action.label}
              </Button>
            )
          )}

          {secondaryAction && (
            secondaryAction.href ? (
              <a
                href={secondaryAction.href}
                className={`font-label text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg hover:underline ${
                  isFloor ? "text-white/80" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {secondaryAction.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className={`font-label text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg hover:underline ${
                  isFloor ? "text-white/80" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {secondaryAction.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
