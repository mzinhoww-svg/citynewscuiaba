import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Item 92 (T-19): o Lighthouse mede também agenda, editoria e guia, e o seed tem uma peça de
// anúncio da casa ativa (a página medida mostra banner, como em produção).
const root = process.cwd();
const rc = JSON.parse(readFileSync(join(root, "lighthouserc.json"), "utf8")) as {
  ci: {
    collect: { url: string[] };
    assert: {
      assertMatrix: { matchingUrlPattern: string; assertions: Record<string, unknown> }[];
    };
  };
};
const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");

const NEW_ROUTES = ["/agenda", "/cidade", "/guia-cuiaba"];

describe("rotas do Lighthouse", () => {
  it.each(NEW_ROUTES)("%s está na coleta", (route) => {
    expect(rc.ci.collect.url).toContain(`http://localhost:3000${route}`);
  });

  it.each(NEW_ROUTES)("%s tem orçamento próprio, coerente com as outras rotas", (route) => {
    const url = `http://localhost:3000${route}`;
    const matching = rc.ci.assert.assertMatrix.filter((m) =>
      new RegExp(m.matchingUrlPattern).test(url),
    );
    expect(matching).toHaveLength(1);
    const a = matching[0]!.assertions;
    expect(a["cumulative-layout-shift"]).toEqual([
      "error",
      { maxNumericValue: 0.1, aggregationMethod: "median" },
    ]);
    expect(a["largest-contentful-paint"]).toEqual([
      "warn",
      { maxNumericValue: 2500, aggregationMethod: "median" },
    ]);
    expect(a["total-blocking-time"]).toEqual([
      "warn",
      { maxNumericValue: 200, aggregationMethod: "median" },
    ]);
    const script = a["resource-summary:script:size"] as [string, { maxNumericValue: number }];
    expect(script[0]).toBe("error");
    expect(script[1].maxNumericValue).toBeLessThanOrEqual(190000);
  });

  it("as rotas antigas continuam casando com um só bloco", () => {
    for (const url of rc.ci.collect.url) {
      const n = rc.ci.assert.assertMatrix.filter((m) =>
        new RegExp(m.matchingUrlPattern).test(url),
      ).length;
      expect(n, url).toBe(1);
    }
  });
});

describe("anúncio da casa no seed", () => {
  const creative = /insert into ad_creatives[\s\S]*?;/.exec(seed)?.[0] ?? "";
  const placement = /insert into ad_placements[\s\S]*?;/.exec(seed)?.[0] ?? "";

  it("peça de imagem ativa, sem anunciante (da casa), com link e imagem fictícios em https", () => {
    expect(creative).not.toBe("");
    expect(creative).not.toMatch(/advertiser_id/);
    expect(creative).toMatch(/'active'/);
    expect(creative).toMatch(/"kind": "display"/);
    expect(creative).toMatch(/"href": "https:\/\/[a-z.-]+\.example\//);
    expect(creative).toMatch(/"imageUrl": "https:\/\/[a-z.-]+\.example\//);
    expect(creative).toMatch(/"alt": "[^"]+"/);
  });

  it("veiculação ativa e sem prazo vencido na editoria medida (Cidade)", () => {
    expect(placement).toMatch(/'active'/);
    expect(placement).toMatch(/'2099-12-31'/);
    expect(placement).toMatch(/'\{cidade\}'/);
  });
});
