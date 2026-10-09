import { describe, expect, it } from "vitest";
import { buildCaption, creditsText, INSTAGRAM_CAPTION_MAX } from "./caption";
import type { PackageItem } from "./items";

const CLOSING = "Confirme horários e valores na fonte oficial antes de sair de casa.";
const EMOJI = /\p{Extended_Pictographic}/u;

const item = (n: number, over: Partial<PackageItem> = {}): PackageItem => ({
  eventId: `id-${n}`,
  slug: `evento-${n}`,
  title: `Show ${n} no Teatro`,
  day: "2026-10-13",
  dayLabel: "Terça, 13 de outubro",
  time: "19h",
  venue: "Teatro do Cerrado, Centro",
  price: "Gratuito",
  origin: "Com informações de Teatro do Cerrado",
  image: null,
  ...over,
});

describe("buildCaption", () => {
  it("abertura, um bloco por evento, créditos, fontes, hashtags e o aviso final", () => {
    const c = buildCaption(
      [
        item(1, {
          image: { assetId: "a", credit: "Teatro do Cerrado", originUrl: "https://t.example/1" },
        }),
        item(2, {
          price: null,
          origin: "Com informações de Casa Exemplo · Confirme na fonte",
          image: { assetId: "b", credit: "Casa Exemplo", originUrl: null },
        }),
        item(3, { origin: null }),
      ],
      "12 a 18 de outubro",
    );
    expect(c).toContain("12 a 18 de outubro");
    expect(c).toContain("Show 1 no Teatro\nDia: Terça, 13 de outubro\nHora: 19h");
    expect(c).toContain("Local: Teatro do Cerrado, Centro");
    expect(c).toContain("Preço: Gratuito");
    expect(c).toContain("Preço: consulte a fonte");
    expect(c).toContain("Com informações de Casa Exemplo · Confirme na fonte");
    expect(c).toContain("Fotos: reprodução web · Teatro do Cerrado, Casa Exemplo");
    expect(c).toContain("#Cuiabá #AgendaCuiabá #CityNews");
    expect(c.endsWith(CLOSING)).toBe(true);
    expect(c).not.toMatch(EMOJI);
    expect(c.match(/#/g)).toHaveLength(3);
  });

  it("sem foto, sem linha de créditos", () => {
    expect(buildCaption([item(1)], "12 a 18 de outubro")).not.toContain("Fotos:");
  });

  it("fonte repetida aparece uma vez nos créditos", () => {
    const img = { assetId: "a", credit: "Fonte A", originUrl: null };
    const c = buildCaption([item(1, { image: img }), item(2, { image: img })], "x");
    expect(c).toContain("Fotos: reprodução web · Fonte A\n");
  });

  it("acima de 2.200 caracteres corta blocos do fim, mantém créditos de todas as fotos e o aviso", () => {
    const long = "Festival de Música Popular e Cultura Regional do Cerrado ".repeat(5);
    const items = Array.from({ length: 6 }, (_, i) =>
      item(i, {
        title: `${long}${i}`,
        venue: `${long} Centro ${i}`,
        image: { assetId: `a${i}`, credit: `Fonte ${i}`, originUrl: null },
      }),
    );
    const c = buildCaption(items, "12 a 18 de outubro");
    expect(c.length).toBeLessThanOrEqual(INSTAGRAM_CAPTION_MAX);
    expect(c).toContain(`${long}0`);
    expect(c).not.toContain(`${long}5\n`);
    expect(c).toMatch(/Mais \d eventos? nos slides\./);
    for (let i = 0; i < 6; i++) expect(c).toContain(`Fonte ${i}`);
    expect(c.endsWith(CLOSING)).toBe(true);
  });

  it("título completo na legenda, mesmo quando o slide corta linhas", () => {
    const title = "Um título muito longo ".repeat(12).trim();
    expect(buildCaption([item(1, { title })], "x")).toContain(title);
  });
});

describe("creditsText", () => {
  it("um bloco por slide de evento com foto, original e origem", () => {
    const t = creditsText([
      item(1, { image: { assetId: "a", credit: "Fonte A", originUrl: "https://a.example/e" } }),
      item(2),
    ]);
    expect(t).toContain(
      "Slide 02 · Show 1 no Teatro\nFoto: reprodução web · Fonte A\nOriginal: https://a.example/e",
    );
    expect(t).toContain("Slide 03 · Show 2 no Teatro\nSem foto (fundo liso)");
    expect(t).toContain(CLOSING);
    expect(t).not.toMatch(EMOJI);
  });
});
