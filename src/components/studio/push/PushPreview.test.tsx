import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PushPreview } from "./PushPreview";

describe("PushPreview (spec §10.2, D-P18)", () => {
  it("prévia leva o rótulo de origem e é texto acessível, não imagem", () => {
    render(
      <PushPreview
        title="Chuva forte"
        body="Defesa Civil alerta"
        originLabel="ORIGINAL CITYNEWS"
      />,
    );
    expect(screen.getAllByText(/ORIGINAL CITYNEWS · Defesa Civil alerta/)).toHaveLength(3);
    expect(screen.getAllByText("Chuva forte")).toHaveLength(3);
    expect(screen.getByRole("figure", { name: "Prévia no Android" })).toBeVisible();
    expect(screen.getByRole("figure", { name: "Prévia no iPhone" })).toBeVisible();
    expect(screen.getByRole("figure", { name: "Prévia no computador" })).toBeVisible();
    expect(document.querySelector("img")).toBeNull();
  });
});
