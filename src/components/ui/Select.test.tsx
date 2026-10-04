import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select } from "./Select";

describe("Select", () => {
  it("desabilitado (item 6)", () => {
    render(<Select id="s" name="s" label="Editoria" options={[]} disabled />);
    expect(screen.getByLabelText("Editoria")).toBeDisabled();
  });

  it("habilitado por padrão", () => {
    render(<Select id="s" name="s" label="Editoria" options={[{ value: "a", label: "A" }]} />);
    expect(screen.getByLabelText("Editoria")).toBeEnabled();
  });
});
