// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../Card";

describe("Card component", () => {
  it("renders with office surface styles by default", () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Office Card</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content Area</CardContent>
        <CardFooter>Footer Action</CardFooter>
      </Card>
    );

    expect(screen.getByText("Office Card")).toBeInTheDocument();
    expect(screen.getByText("Content Area")).toBeInTheDocument();
    expect(screen.getByText("Footer Action")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-surface");
  });

  it("renders with floor surface styles when surface='floor'", () => {
    const { container } = render(
      <Card surface="floor">
        <CardTitle>Floor Card</CardTitle>
      </Card>
    );

    expect(container.firstChild).toHaveClass("bg-white/10");
    expect(container.firstChild).toHaveClass("text-white");
  });
});
