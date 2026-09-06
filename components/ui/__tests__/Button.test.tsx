// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../Button";

describe("Button component", () => {
  it("renders with default primary variant and text", () => {
    render(<Button>Click Me</Button>);
    const btn = screen.getByRole("button", { name: /click me/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveClass("bg-primary");
  });

  it("handles click events", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Submit</Button>);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders loading state and disables interactions", () => {
    const handleClick = vi.fn();
    render(
      <Button isLoading loadingText="Saving..." onClick={handleClick}>
        Save
      </Button>
    );
    const btn = screen.getByRole("button", { name: /saving\.\.\./i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("supports floor-specific 64px CTA variants", () => {
    render(<Button variant="floor-primary">Floor Action</Button>);
    const btn = screen.getByRole("button", { name: /floor action/i });
    expect(btn).toHaveClass("min-h-[64px]");
  });

  it("renders left and right icons", () => {
    render(
      <Button
        leftIcon={<span data-testid="left-icon">L</span>}
        rightIcon={<span data-testid="right-icon">R</span>}
      >
        Icon Button
      </Button>
    );
    expect(screen.getByTestId("left-icon")).toBeInTheDocument();
    expect(screen.getByTestId("right-icon")).toBeInTheDocument();
  });
});
