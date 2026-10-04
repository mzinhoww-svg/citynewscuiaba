import { describe, expect, it } from "vitest";
import { filterStudioNav } from "./nav-filter";
import type { StudioNavGroup } from "./StudioShell";

const NAV: StudioNavGroup[] = [
  {
    label: "Redação",
    items: [
      { href: "/estudio", label: "Newsroom", icon: "layout-dashboard", exact: true },
      { href: "/estudio/fila", label: "Fila de matérias", icon: "newspaper" },
      { href: "/estudio/midia", label: "Mídia", icon: "camera" },
    ],
  },
  {
    label: "Control Center",
    items: [
      { href: "/estudio/control/logs", label: "Logs", icon: "scroll-text" },
      { href: "/estudio/control/falhas", label: "Falhas", icon: "circle-alert" },
    ],
  },
];

describe("filterStudioNav", () => {
  it("sem busca devolve a navegação inteira", () => {
    expect(filterStudioNav(NAV, "")).toEqual(NAV);
    expect(filterStudioNav(NAV, "   ")).toEqual(NAV);
  });

  it("filtra pelo rótulo do item, sem acento e sem caixa", () => {
    expect(filterStudioNav(NAV, "MIDIA")).toEqual([
      { label: "Redação", items: [NAV[0]!.items[2]] },
    ]);
    expect(filterStudioNav(NAV, "matéria")[0]!.items.map((i) => i.label)).toEqual([
      "Fila de matérias",
    ]);
  });

  it("busca pelo nome do grupo mostra o grupo inteiro", () => {
    expect(filterStudioNav(NAV, "control")).toEqual([NAV[1]]);
  });

  it("remove grupos sem resultado e devolve vazio quando nada casa", () => {
    expect(filterStudioNav(NAV, "fa").map((g) => g.label)).toEqual(["Control Center"]);
    expect(filterStudioNav(NAV, "xyz")).toEqual([]);
  });
});
