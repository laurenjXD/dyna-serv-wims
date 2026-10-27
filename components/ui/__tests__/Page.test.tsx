// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MegaCard, PageContainer, PageHeader, PageRoot, PageSection } from "../Page";

describe("page composition primitives", () => {
  it("provides a shared page root and container contract", () => {
    render(
      <PageRoot surface="office">
        <PageContainer>
          <PageHeader title="Inventory" description="Review warehouse stock." />
          <PageSection title="Stock view">
            <MegaCard>Inventory table</MegaCard>
          </PageSection>
        </PageContainer>
      </PageRoot>,
    );

    expect(screen.getByTestId("page-root")).toHaveAttribute("data-ui", "page-root");
    expect(screen.getByTestId("page-container")).toHaveAttribute("data-ui", "page-container");
    expect(screen.getByRole("heading", { name: "Inventory" })).toBeInTheDocument();
    expect(screen.getByTestId("mega-card")).toHaveAttribute("data-ui", "mega-card");
  });
});
