import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingRegion } from "./LoadingRegion";

describe("LoadingRegion", () => {
  it("anuncia o carregamento num status fora da área com aria-busy", () => {
    render(
      <LoadingRegion label="Carregando notícias" className="grid gap-4">
        <div data-testid="esqueleto" />
      </LoadingRegion>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Carregando notícias");
    expect(status.closest("[aria-busy]")).toBeNull();
    const busy = screen.getByTestId("esqueleto").closest("[aria-busy='true']");
    expect(busy).not.toBeNull();
    expect(busy).toHaveClass("grid", "gap-4");
    expect(busy).not.toHaveAttribute("aria-live");
    expect(busy?.contains(status)).toBe(false);
  });
});
