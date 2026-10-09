// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { socialFonts } from "./fonts";
import type { PackageItem } from "./items";
import { photoBox, PHOTO_AREA, renderSlides, SLIDE_HEIGHT, SLIDE_WIDTH, TITLE_FIT } from "./slides";
import { fitText } from "./text-fit";

/** Largura e altura do PNG pelo cabeçalho IHDR (bytes 16–23). */
function pngSize(png: Uint8Array): { width: number; height: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  sig.forEach((b, i) => expect(png[i]).toBe(b));
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  expect(String.fromCharCode(...png.slice(12, 16))).toBe("IHDR");
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

const item = (over: Partial<PackageItem> = {}): PackageItem => ({
  eventId: "e1",
  slug: "e1",
  title: "Noite do Siriri",
  day: "2026-10-13",
  dayLabel: "Terça, 13 de outubro",
  time: "19h",
  venue: "Teatro do Cerrado, Centro",
  price: "Gratuito",
  origin: "Com informações de Teatro do Cerrado",
  source: "Teatro do Cerrado",
  image: null,
  ...over,
});

async function photo(): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buf);
}

/** Cor média de uma faixa do PNG (para distinguir fundo liso de foto). */
async function meanColor(png: Uint8Array, top: number) {
  const { data } = await sharp(png)
    .extract({ left: 0, top, width: SLIDE_WIDTH, height: 20 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  const px = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
  }
  return { r: r / px, g: g / px, b: b / px };
}

describe("photoBox", () => {
  it("a foto cabe inteira acima da faixa do crédito e fica centralizada nessa área", () => {
    expect(PHOTO_AREA).toEqual({ width: 1080, height: 1254 });
    // Paisagem 3:2: largura cheia, centralizada na vertical da área.
    expect(photoBox(1200, 800)).toEqual({ left: 0, top: 267, width: 1080, height: 720 });
    // Retrato alto: altura cheia da área, nunca invade a faixa (top + height ≤ 1254).
    const tall = photoBox(800, 1600);
    expect(tall).toEqual({ left: 227, top: 0, width: 627, height: 1254 });
    for (const [w, h] of [
      [1080, 1350],
      [400, 2000],
      [3000, 500],
    ] as const) {
      const b = photoBox(w, h);
      expect(b.top + b.height).toBeLessThanOrEqual(PHOTO_AREA.height);
      expect(b.left + b.width).toBeLessThanOrEqual(PHOTO_AREA.width);
    }
  });
});

describe("renderSlides", () => {
  it("capa + um slide por evento + final, todos PNG 1080×1350", async () => {
    const r = await renderSlides({
      rangeLabel: "12 a 18 de outubro",
      items: [item(), item({ eventId: "e2", price: null })],
      images: new Map(),
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.pngs).toHaveLength(4);
    for (const png of r.value.pngs) expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
    expect(SLIDE_WIDTH).toBe(1080);
    expect(SLIDE_HEIGHT).toBe(1350);
  });

  it("sem imagem: fundo liso #111111; com imagem: foto escurecida e evento marcado", async () => {
    const r = await renderSlides({
      rangeLabel: "12 a 18 de outubro",
      items: [
        item(),
        item({
          eventId: "e2",
          image: { assetId: "a", credit: "Teatro do Cerrado", originUrl: null },
        }),
      ],
      images: new Map([["e2", await photo()]]),
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.withImage).toEqual(["e2"]);
    // Faixa do meio do slide (a foto 3:2 fica centralizada, sem recorte).
    const flat = await meanColor(r.value.pngs[1]!, 600);
    expect(flat.r).toBeCloseTo(17, 0);
    expect(flat.b).toBeCloseTo(17, 0);
    const withPhoto = await meanColor(r.value.pngs[2]!, 600);
    expect(withPhoto.b).toBeGreaterThan(withPhoto.r + 20);
    // A faixa do crédito (últimos 96 px) é lisa #111111, sem a foto por baixo.
    const bar = await meanColor(r.value.pngs[2]!, SLIDE_HEIGHT - 60);
    expect(bar.b).toBeLessThan(40);
  });

  it("título com emoji renderiza sem lançar (o item já chega sem emoji)", async () => {
    const r = await renderSlides({
      rangeLabel: "x",
      items: [item({ title: "Festa junina 🎉🔥 no Porto" })],
      images: new Map(),
    });
    expect(r.ok).toBe(true);
    const fit = fitText("Festa junina 🎉🔥 no Porto", socialFonts().serifBold.metrics, TITLE_FIT);
    expect(fit.clamped).toBe(false);
  });

  it("imagem ilegível cai no fundo liso sem quebrar", async () => {
    const r = await renderSlides({
      rangeLabel: "x",
      items: [item({ image: { assetId: "a", credit: "F", originUrl: null } })],
      images: new Map([["e1", new Uint8Array([1, 2, 3])]]),
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.withImage).toEqual([]);
    expect(r.value.pngs).toHaveLength(3);
  });

  it("título longo quebra e reduz o corpo sem lançar; longuíssimo corta linhas sem reticências", async () => {
    const long =
      "Festival Internacional de Música Popular e Cultura Regional do Cerrado Mato-Grossense";
    const huge = `${long} ${long} ${long} ${long} ${long}`;
    const r = await renderSlides({
      rangeLabel: "x",
      items: [
        item({ title: `${long} ${long}` }),
        item({ eventId: "e2", title: huge, venue: `${long}, ${long}` }),
      ],
      images: new Map(),
    });
    if (!r.ok) throw new Error(r.error);
    for (const png of r.value.pngs) expect(pngSize(png)).toEqual({ width: 1080, height: 1350 });
    expect(r.value.clamped).toEqual(["e2"]);

    const m = socialFonts().serifBold.metrics;
    const short = fitText("Noite do Siriri", m, TITLE_FIT);
    const mid = fitText(`${long} ${long}`, m, TITLE_FIT);
    const big = fitText(huge, m, TITLE_FIT);
    expect(short.size).toBe(TITLE_FIT.sizes[0]);
    expect(mid.size).toBeLessThan(short.size);
    expect(mid.clamped).toBe(false);
    expect(mid.lines.join(" ")).toBe(`${long} ${long}`);
    expect(big.size).toBe(TITLE_FIT.sizes[TITLE_FIT.sizes.length - 1]);
    expect(big.clamped).toBe(true);
    expect(big.lines).toHaveLength(TITLE_FIT.maxLines);
    expect(big.lines.join(" ")).not.toMatch(/…|\.\.\./);
    for (const line of [...mid.lines, ...big.lines])
      expect(m.measure(line, big.size)).toBeLessThanOrEqual(TITLE_FIT.maxWidth);
  });
});
