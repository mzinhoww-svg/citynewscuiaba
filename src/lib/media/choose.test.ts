import { describe, expect, it } from "vitest";
import { checkImage, isSensationalText, watermarkHint } from "./checks";
import { chooseImage, mayGenerate, safeGenerationPrompt, type ChooseInput } from "./choose";
import type { Candidate } from "./types";

const good: Candidate = {
  url: "https://folhadocerrado.example/cidade/feira-no-porto",
  imageUrl: "https://folhadocerrado.example/img/feira.jpg",
  sourceName: "Folha do Cerrado",
  author: "Ana Prado",
  width: 1600,
  height: 900,
  fit: 1,
  phashDistances: [],
  watermark: false,
};

const ilustr: Candidate = {
  url: "acervo/cidade-rua.png",
  assetId: "m-ilustr",
  width: 1600,
  height: 1067,
  fit: 0.9,
  phashDistances: [],
  watermark: false,
};

const base: ChooseInput = {
  sourcePolicy: "none",
  hasAgreement: false,
  reproductionEnabled: true,
  licensed: [],
  archive: [],
  topicAllowsGenerated: false,
  category: "cidade",
};

describe("chooseImage (cascata da spec §6.5)", () => {
  it("fonte com política reproduction usa a imagem original como REPRODUÇÃO com crédito e link", () => {
    const r = chooseImage({
      ...base,
      sourcePolicy: "reproduction",
      reproductionEnabled: true,
      original: good,
    });
    expect(r.kind).toBe("reproduction");
    expect(r.asset).toBe(good);
    expect(r.credit).toEqual({
      sourceName: "Folha do Cerrado",
      author: "Ana Prado",
      url: "https://folhadocerrado.example/cidade/feira-no-porto",
    });
    expect(r.rationale).toMatch(/REPRODUÇÃO/);
  });

  it("reprodução sem autor não inventa crédito de autor", () => {
    const r = chooseImage({
      ...base,
      sourcePolicy: "reproduction",
      original: { ...good, author: undefined },
    });
    expect(r.credit).toEqual({ sourceName: "Folha do Cerrado", url: good.url });
  });

  it("flag desligada impede reprodução", () =>
    expect(
      chooseImage({
        ...base,
        sourcePolicy: "reproduction",
        reproductionEnabled: false,
        original: good,
        archive: [ilustr],
      }).kind,
    ).toBe("illustrative"));

  it("original sem acordo nunca é usada", () =>
    expect(
      chooseImage({ ...base, sourcePolicy: "with_agreement", hasAgreement: false, original: good })
        .kind,
    ).not.toBe("original"));

  it("original com acordo vigente vem primeiro, com crédito", () => {
    const r = chooseImage({
      ...base,
      sourcePolicy: "with_agreement",
      hasAgreement: true,
      original: good,
      archive: [ilustr],
    });
    expect(r).toMatchObject({ kind: "original", credit: { sourceName: "Folha do Cerrado" } });
  });

  it("política none ou licensed_only nunca usa a imagem da fonte", () => {
    for (const sourcePolicy of ["none", "licensed_only"] as const)
      expect(chooseImage({ ...base, sourcePolicy, original: good }).kind).toBe("typographic");
  });

  it("imagem da fonte reprovada nas verificações cai para a próxima opção", () => {
    const r = chooseImage({
      ...base,
      sourcePolicy: "reproduction",
      original: { ...good, width: 800, height: 450 },
      archive: [ilustr],
    });
    expect(r.kind).toBe("illustrative");
    expect(r.rationale).toMatch(/low_res/);
  });

  it("reprodução mantém a marca d'água da fonte (sem recorte): não reprova", () =>
    expect(
      chooseImage({ ...base, sourcePolicy: "reproduction", original: { ...good, watermark: true } })
        .kind,
    ).toBe("reproduction"));

  it("licenciada abaixo de 0,7 de adequação é pulada", () =>
    expect(
      chooseImage({ ...base, licensed: [{ ...good, fit: 0.6 }], archive: [ilustr] }).kind,
    ).toBe("illustrative"));

  it("licenciada com marca d'água é pulada", () =>
    expect(
      chooseImage({ ...base, licensed: [{ ...good, watermark: true }], archive: [ilustr] }).kind,
    ).toBe("illustrative"));

  it("acervo escolhe a mais adequada", () => {
    const r = chooseImage({
      ...base,
      archive: [
        { ...ilustr, assetId: "a", fit: 0.75 },
        { ...ilustr, assetId: "b", fit: 0.95 },
      ],
    });
    expect(r.asset?.assetId).toBe("b");
    expect(r.credit).toBeNull();
  });

  it("gerada só quando o tema permite e não há acervo", () => {
    expect(chooseImage({ ...base, category: "cultura", topicAllowsGenerated: true }).kind).toBe(
      "ai_generated",
    );
    expect(chooseImage({ ...base, category: "cultura", topicAllowsGenerated: false }).kind).toBe(
      "typographic",
    );
  });

  it("segurança nunca recebe imagem gerada", () =>
    expect(
      chooseImage({ ...base, category: "seguranca", topicAllowsGenerated: true, archive: [] }).kind,
    ).toBe("typographic"));

  it("saúde, tema sensível ou etiqueta de tragédia nunca recebem imagem gerada", () => {
    const allowed = { ...base, topicAllowsGenerated: true };
    expect(chooseImage({ ...allowed, category: "saude" }).kind).toBe("typographic");
    expect(chooseImage({ ...allowed, category: "cultura", sensitive: true }).kind).toBe(
      "typographic",
    );
    expect(
      chooseImage({ ...allowed, category: "cidade", tags: ["acidente de trânsito"] }).kind,
    ).toBe("typographic");
  });

  it("sem nada aprovado, card tipográfico", () => {
    const r = chooseImage(base);
    expect(r).toMatchObject({ kind: "typographic", credit: null });
    expect(r.asset).toBeUndefined();
  });
});

describe("mayGenerate e prompt seguro (regra 9)", () => {
  it("bloqueia crime, tragédia e saúde individual", () => {
    expect(mayGenerate({ category: "cultura" })).toBe(true);
    expect(mayGenerate({ category: "seguranca" })).toBe(false);
    expect(mayGenerate({ category: "cidade", tags: ["Homicídio"] })).toBe(false);
    expect(mayGenerate({ category: "cidade", tags: ["morte"] })).toBe(false);
    expect(mayGenerate({ category: "cidade", sensitive: true })).toBe(false);
  });

  it("nunca pede imagem fotorrealista nem retrato de pessoa real", () => {
    expect(safeGenerationPrompt("Foto realista do prefeito no palanque")).toEqual({
      ok: false,
      error: "photorealistic",
    });
    expect(safeGenerationPrompt("retrato do secretário de obras").ok).toBe(false);
    const r = safeGenerationPrompt("Ilustração de um ônibus passando por uma avenida arborizada");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatch(/não fotorrealista/);
  });
});

describe("checkImage", () => {
  it("baixa resolução reprova", () =>
    expect(
      checkImage({ width: 800, height: 450, phashDistances: [], watermark: false }).issues,
    ).toContain("low_res"));
  it("1200 px no lado maior passa", () =>
    expect(checkImage({ width: 1200, height: 1600, phashDistances: [], watermark: false })).toEqual(
      { ok: true, issues: [] },
    ));
  it("hash perceptual próximo do acervo é duplicada", () =>
    expect(
      checkImage({ width: 1600, height: 900, phashDistances: [30, 4], watermark: false }).issues,
    ).toEqual(["duplicate"]));
  it("marca d'água e sensacionalismo reprovam", () =>
    expect(
      checkImage({
        width: 1600,
        height: 900,
        phashDistances: [],
        watermark: true,
        sensational: true,
      }).issues,
    ).toEqual(["watermark", "sensational"]));
  it("reprodução aceita a marca d'água da fonte", () =>
    expect(
      checkImage({ width: 1600, height: 900, phashDistances: [], watermark: true }, "reproduction")
        .ok,
    ).toBe(true));
  it("dimensão inválida reprova como baixa resolução", () =>
    expect(
      checkImage({ width: Number.NaN, height: 900, phashDistances: [], watermark: false }).issues,
    ).toContain("low_res"));
});

describe("pistas de marca d'água e sensacionalismo", () => {
  it("URL de banco de imagem ou arquivo de prévia sugere marca d'água", () => {
    expect(watermarkHint("https://cdn.example/fotos/watermark/praca.jpg")).toBe(true);
    expect(watermarkHint("https://images.stockbank.example/preview-123.jpg?wm=1")).toBe(true);
    expect(watermarkHint("https://folhadocerrado.example/img/feira.jpg")).toBe(false);
  });
  it("legenda ou título chocante é sensacionalista", () => {
    expect(isSensationalText("Imagens fortes: corpo é encontrado no rio")).toBe(true);
    expect(isSensationalText("Feira de artesanato ocupa a Orla do Porto")).toBe(false);
  });
});
