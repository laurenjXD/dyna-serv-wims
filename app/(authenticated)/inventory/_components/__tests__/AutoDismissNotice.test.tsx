// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoDismissNotice } from "../AutoDismissNotice";

describe("AutoDismissNotice", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps the notice visible until three seconds, then removes it", () => {
    render(
      <AutoDismissNotice>
        <div role="status">Pick list generated successfully</div>
      </AutoDismissNotice>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2_999));
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
