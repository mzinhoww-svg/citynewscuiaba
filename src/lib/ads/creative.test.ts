import { describe, expect, it } from "vitest";
import { parseCreative } from "./creative";

const ok = (v: unknown) => {
  const r = parseCreative(v);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const bad = (v: unknown) => {
  const r = parseCreative(v);
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error;
};
const href = "https://padaria.example/promo";

describe("creative tipado (MS-T2)", () => {
  it("nativo: aceita o válido, sem kind vira nativo (campanhas antigas)", () => {
    expect(ok({ kind: "native", title: "Pão quente às 6h", href }).kind).toBe("native");
    const legacy = ok({ title: "Pão quente às 6h", href });
    expect(legacy).toMatchObject({ kind: "native", weight: 1 });
  });

  it("nativo: imagem exige texto alternativo; link precisa de https", () => {
    bad({ kind: "native", title: "Pão", href, imageUrl: "https://img.example/a.jpg" });
    bad({
      kind: "native",
      title: "Pão",
      href,
      imageUrl: "https://img.example/a.jpg",
      imageAlt: " ",
    });
    bad({ kind: "native", title: "Pão quente", href: "http://padaria.example" });
    bad({ kind: "native", title: "Pão quente", href: "javascript:alert(1)" });
  });

  it("display: só nas dimensões do campo, com alt e imagem https", () => {
    const base = {
      kind: "display",
      slot: "TOP",
      imageUrl: "https://img.example/t.png",
      alt: "Pães",
      href,
    };
    expect(ok({ ...base, width: 970, height: 250 }).kind).toBe("display");
    expect(ok({ ...base, width: 320, height: 100 }).kind).toBe("display");
    expect(bad({ ...base, width: 300, height: 250 })).toMatch(/dimens/i);
    bad({ ...base, width: 970, height: 250, alt: "" });
    bad({ ...base, width: 970, height: 250, href: "http://padaria.example" });
    bad({ ...base, width: 970, height: 250, imageUrl: "http://img.example/t.png" });
    bad({ ...base, slot: "HUB", width: 970, height: 250 });
  });

  it("tile: título curto e ícone com alt", () => {
    expect(ok({ kind: "tile", title: "Feira do Porto", href }).kind).toBe("tile");
    bad({
      kind: "tile",
      title: "Um título longo demais para caber num tile de serviço da home",
      href,
    });
    bad({ kind: "tile", title: "Feira", href, iconUrl: "https://img.example/i.png" });
    bad({ kind: "tile", title: "Feira", href: "http://x.example" });
  });

  it("newsletter: texto de até 140 caracteres", () => {
    expect(
      ok({ kind: "newsletter", text: "Pão quente às 6h na Padaria do Porto.", href }).kind,
    ).toBe("newsletter");
    bad({ kind: "newsletter", text: "x".repeat(141), href });
    bad({ kind: "newsletter", text: "Pão quente", href, imageUrl: "https://img.example/n.png" });
    bad({ kind: "newsletter", text: "Pão quente", href: "http://x.example" });
  });

  it("vídeo: só no HUB, até 60 s, com pôster e alt", () => {
    const v = {
      kind: "video",
      slot: "HUB",
      videoUrl: "https://cdn.example/v.mp4",
      posterUrl: "https://cdn.example/p.jpg",
      alt: "Entrevista com o padeiro",
      href,
      durationSeconds: 45,
    };
    expect(ok(v).kind).toBe("video");
    bad({ ...v, durationSeconds: 90 });
    bad({ ...v, alt: "" });
    bad({ ...v, slot: "TOP" });
    bad({ ...v, href: "http://x.example" });
  });

  it("peso e limite diário opcionais, sempre positivos", () => {
    expect(
      ok({ kind: "native", title: "Pão quente", href, weight: 3, maxImpressionsPerDay: 500 }),
    ).toMatchObject({ weight: 3, maxImpressionsPerDay: 500 });
    bad({ kind: "native", title: "Pão quente", href, weight: 0 });
    bad({ kind: "native", title: "Pão quente", href, maxImpressionsPerDay: -1 });
    bad({ kind: "resposta", title: "Resposta patrocinada", href });
  });
});
