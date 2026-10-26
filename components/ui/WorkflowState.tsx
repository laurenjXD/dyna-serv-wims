import React from "react";
import { SearchX } from "@/components/ui/icons";
import { Alert } from "./Alert";
import { EmptyState } from "./EmptyState";
import { SkeletonCard } from "./Skeleton";
import type { ButtonProps } from "./Button";

export type WorkflowStateKind =
  | "loading"
  | "empty"
  | "error"
  | "forbidden"
  | "stale"
  | "conflict"
  | "offline"
  | "unavailable";

export interface WorkflowStateProps {
  kind: WorkflowStateKind;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  actionVariant?: ButtonProps["variant"];
  surface?: "office" | "floor";
  className?: string;
  testId?: string;
}

/**
 * Shared What / Why / Next Action state renderer for workflow screens.
 * Keep feature components responsible for choosing the state and copy; keep
 * layout, semantics, touch targets, and visual language here.
 */
export function WorkflowState({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  actionVariant,
  surface = "office",
  className = "",
  testId,
}: WorkflowStateProps) {
  if (kind === "loading") {
    return (
      <div data-testid={testId} role="status" aria-label={title} className={className}>
        <SkeletonCard surface={surface} />
      </div>
    );
  }

  if (kind === "empty") {
    return (
      <div data-testid={testId} className={className}>
        <EmptyState
          icon={<SearchX className="h-7 w-7" aria-hidden="true" />}
          title={title}
          description={description}
          surface={surface}
          action={actionLabel && (onAction || actionHref) ? {
            label: actionLabel,
            onClick: onAction,
            href: actionHref,
            variant: actionVariant,
          } : undefined}
        />
      </div>
    );
  }

  const variant = kind === "error" || kind === "conflict" ? "error" : kind === "stale" || kind === "offline" || kind === "unavailable" ? "warning" : "info";
  return (
    <div data-testid={testId} className={className}>
      <Alert
        variant={variant}
        title={title}
        description={description}
        actionLabel={actionLabel}
        onAction={onAction}
        actionHref={actionHref}
        surface={surface}
      />
    </div>
  );
}
