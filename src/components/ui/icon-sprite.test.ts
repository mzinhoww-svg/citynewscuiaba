// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ICON_MAP } from "../../../scripts/icon-map.mjs";
import { spriteModule } from "../../../scripts/build-icon-sprite.mjs";
import { ICON_NAMES } from "./icon-names";
import { ICON_SPRITE } from "./icon-sprite";

describe("sprite de ícones (B-018)", () => {
  it("as listas de nomes coincidem", () => {
    expect([...ICON_NAMES].sort()).toEqual(Object.keys(ICON_MAP).sort());
  });

  it("todo ícone tem um <symbol> no sprite", () => {
    for (const name of ICON_NAMES) {
      expect(ICON_SPRITE, name).toContain(`<symbol id="icon-${name}" viewBox="0 0 24 24">`);
    }
  });

  it("o sprite gravado está em dia com o lucide-react (rode pnpm icons:sprite)", () => {
    const disk = readFileSync("src/components/ui/icon-sprite.ts", "utf8");
    expect(disk).toBe(spriteModule());
  });

  it("nada de script nem handler no sprite", () => {
    expect(ICON_SPRITE).not.toMatch(/<script|onload|onerror|javascript:/i);
  });
});
