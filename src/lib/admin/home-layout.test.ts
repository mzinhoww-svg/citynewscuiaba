import { describe, expect, it } from "vitest";
import {
  HOME_MODULE_IDS,
  defaultHomeLayout,
  moveModule,
  parseHomeLayout,
  sameLayout,
  toggleModule,
  validateHomeLayout,
} from "./home-layout";

describe("módulos da home (A06)", () => {
  it("parse ignora ids desconhecidos e duplicados e completa os que faltam, desligados", () => {
    const out = parseHomeLayout([
      { id: "sections", enabled: true },
      { id: "banner", enabled: true },
      { id: "sections", enabled: false },
      { id: "topics", enabled: false },
    ]);
    expect(out.slice(0, 2)).toEqual([
      { id: "sections", enabled: true },
      { id: "topics", enabled: false },
    ]);
    expect(out.map((m) => m.id).sort()).toEqual([...HOME_MODULE_IDS].sort());
    expect(out.filter((m) => m.enabled)).toHaveLength(1);
    expect(parseHomeLayout("lixo")).toEqual(
      defaultHomeLayout().map((m) => ({ ...m, enabled: false })),
    );
  });

  it("move uma posição para cima ou para baixo e para nas pontas", () => {
    const base = defaultHomeLayout();
    const down = moveModule(base, "topics", "down");
    expect(down.map((m) => m.id).slice(0, 2)).toEqual(["collections", "topics"]);
    expect(moveModule(base, "topics", "up").map((m) => m.id)).toEqual(base.map((m) => m.id));
    expect(moveModule(base, "newsletter", "down").map((m) => m.id)).toEqual(base.map((m) => m.id));
    expect(base.map((m) => m.id)[0]).toBe("topics");
  });

  it("liga e desliga sem mudar a ordem; rascunho sem módulo ligado não publica", () => {
    const all = defaultHomeLayout();
    const off = all.reduce((acc, m) => toggleModule(acc, m.id), all);
    expect(off.every((m) => !m.enabled)).toBe(true);
    expect(validateHomeLayout(off)).toEqual({ ok: false, reason: "none_enabled" });
    expect(validateHomeLayout(all)).toEqual({ ok: true });
    expect(validateHomeLayout(all.slice(1))).toEqual({ ok: false, reason: "missing" });
    expect(sameLayout(all, toggleModule(toggleModule(all, "nearby"), "nearby"))).toBe(true);
    expect(sameLayout(all, toggleModule(all, "nearby"))).toBe(false);
  });
});
