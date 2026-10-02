import { SWITCH_INFO, SWITCH_KEYS } from "@/content/pt-BR/switches";
import { FLAG_KEYS } from "@/lib/flags";
import { ADMIN_NAV } from "@/app/estudio/admin/nav";

describe("interruptores", () => {
  it("cobrem todas as flags do sistema, com texto para cada uma", () => {
    expect([...SWITCH_KEYS].sort()).toEqual([...FLAG_KEYS].sort());
    for (const k of SWITCH_KEYS) {
      expect(SWITCH_INFO[k].title).not.toBe("");
      expect(SWITCH_INFO[k].on).not.toBe("");
      expect(SWITCH_INFO[k].off).not.toBe("");
    }
  });

  it("entram na navegação da Administração", () => {
    expect(ADMIN_NAV.map((e) => e.href)).toContain("/estudio/admin/interruptores");
  });
});
