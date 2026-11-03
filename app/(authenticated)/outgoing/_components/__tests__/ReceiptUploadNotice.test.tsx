// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptUploadNotice } from "../ReceiptUploadNotice";

describe("ReceiptUploadNotice", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("leaves space below the notice and dismisses it after three seconds", () => {
    render(<ReceiptUploadNotice status="success" />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Delivery Receipt uploaded.");
    expect(notice.className).toContain("mb-6");

    act(() => vi.advanceTimersByTime(2_999));
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
