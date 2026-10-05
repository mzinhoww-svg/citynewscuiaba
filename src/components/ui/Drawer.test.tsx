import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { stubDialog } from "./dialog-test-utils";
import { Drawer } from "./Drawer";

let calls: ReturnType<typeof stubDialog>;
beforeEach(() => {
  calls = stubDialog();
  document.documentElement.style.overflow = "";
});

function Harness({ side }: { side?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir gaveta
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Gerar imagem"
        side={side}
        footer={<button type="button">Aplicar</button>}
      >
        <p>Corpo da gaveta</p>
      </Drawer>
    </>
  );
}

describe("Drawer", () => {
  it("fechado não renderiza nada", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("abre modal com título, corpo, rodapé e trava a rolagem", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir gaveta" }));
    const dialog = screen.getByRole("dialog", { name: "Gerar imagem" });
    expect(calls.showModal).toBe(1);
    expect(dialog).toHaveTextContent("Corpo da gaveta");
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeInTheDocument();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(dialog.className).toMatch(/motion-safe:animate-drawer-in/);
    expect(dialog.className).toMatch(/\bmr-auto\b/);
  });

  it("lado direito encosta à direita", () => {
    render(<Harness side="right" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir gaveta" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toMatch(/\bml-auto\b/);
    expect(dialog.className).toMatch(/animate-drawer-in-right/);
  });

  it("Fechar chama close() antes de desmontar, devolve o foco e solta a rolagem", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Abrir gaveta" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.closeWhileConnected).toBe(1);
    expect(calls.closeDetached).toBe(0);
    expect(document.activeElement).toBe(opener);
    expect(document.documentElement.style.overflow).toBe("");
  });
});
