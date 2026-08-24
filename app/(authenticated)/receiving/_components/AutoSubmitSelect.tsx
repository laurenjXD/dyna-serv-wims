"use client";

import type { SelectHTMLAttributes } from "react";

type AutoSubmitSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Keeps server-rendered list filters bookmarkable while removing a separate Apply step. */
export function AutoSubmitSelect({ onChange, ...props }: AutoSubmitSelectProps) {
  return (
    <select
      {...props}
      onChange={(event) => {
        onChange?.(event);
        event.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
