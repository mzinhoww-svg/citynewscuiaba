import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCssToken } from "@/lib/theme/css-token";
import manifest from "./manifest";

describe("manifesto (spec §7.10)", () => {
  it("campos da spec", () => {
    const m = manifest();
    expect(m).toMatchObject({
      name: "CityNews Cuiabá",
      short_name: "CityNews",
      start_url: "/?origem=app",
      display: "standalone",
      scope: "/",
      lang: "pt-BR",
      dir: "ltr",
      id: "/",
    });
    expect(m.theme_color).toBe(readCssToken("--cn-tinta"));
    expect(m.background_color).toBe(readCssToken("--cn-tinta"));
    expect(m.icons!.map((i) => `${i.sizes}:${i.purpose ?? "any"}`)).toEqual(
      expect.arrayContaining([
        "192x192:any",
        "512x512:any",
        "192x192:maskable",
        "512x512:maskable",
      ]),
    );
    expect(m.shortcuts!.map((s) => [s.name, s.url])).toEqual([
      ["Últimas", "/#ultimas"],
      ["Salvos", "/favoritos"],
      ["Busca", "/busca"],
    ]);
  });
  it("todo ícone do manifesto existe em public/", () => {
    for (const i of manifest().icons!) expect(existsSync(`public${i.src}`), i.src).toBe(true);
  });
});
