import React, { forwardRef } from "react";

export type CardSurface = "office" | "floor";
export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: CardSurface;
  padding?: CardPadding;
  hoverable?: boolean;
}

const paddingStyles: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      surface = "office",
      padding = "md",
      hoverable = false,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const isFloor = surface === "floor";

    const baseStyles = isFloor
      ? "bg-white/10 border border-white/20 text-white rounded-2xl shadow-none"
      : "bg-surface border border-border text-text-primary rounded-2xl shadow-elevation-1";

    const hoverStyles = hoverable
      ? isFloor
        ? "transition-all duration-150 hover:bg-white/15 cursor-pointer active:scale-[0.99]"
        : "transition-all duration-150 hover:shadow-elevation-2 hover:border-slate-300 cursor-pointer active:scale-[0.99]"
      : "";

    return (
      <div
        ref={ref}
        className={`flex flex-col overflow-hidden ${baseStyles} ${paddingStyles[padding]} ${hoverStyles} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  action?: React.ReactNode;
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className = "", action, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex flex-wrap items-center justify-between gap-3 pb-4 ${className}`}
        {...props}
      >
        <div className="flex-1 min-w-0">{children}</div>
        {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
      </div>
    );
  }
);

CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className = "", children, ...props }, ref) => {
  return (
    <h3
      ref={ref}
      className={`font-heading text-lg font-bold tracking-tight text-inherit ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
});

CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className = "", children, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={`font-body text-xs text-text-secondary mt-1 ${className}`}
      {...props}
    >
      {children}
    </p>
  );
});

CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = "", children, ...props }, ref) => {
  return (
    <div ref={ref} className={`flex-1 text-inherit ${className}`} {...props}>
      {children}
    </div>
  );
});

CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = "", children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={`flex items-center justify-between gap-3 pt-4 mt-auto border-t border-inherit/10 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

CardFooter.displayName = "CardFooter";
