// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { makeVariants } from "./make-variants";
import { createMemoryMediaStore } from "./store";
import {
  VARIANT_WIDTHS,
  mediaSrcSet,
  pickVariantWidth,
  saveVariants,
  variantPath,
  variantWidthsFor,
} from "./variants";

const ID = "5b0a3f7e-8c1d-4e2f-9a6b-1c2d3e4f5a6b";

const image = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .jpeg()
    .toBuffer();

describe("variantes por largura (itens 79)", () => {
  it("larguras fixas 480, 960 e 1440", () => {
    expect([...VARIANT_WIDTHS]).toEqual([480, 960, 1440]);
  });

  it("caminho da variante deriva do original (mesmo ativo, mesma pasta)", () => {
    expect(variantPath("reproducao/abc.jpg", 480)).toBe("reproducao/abc.w480.webp");
    expect(variantPath("original/abc.png", 1440)).toBe("original/abc.w1440.webp");
    expect(variantPath("teste/sem-extensao", 960)).toBe("teste/sem-extensao.w960.webp");
  });

  it("só larguras menores que o original (nunca amplia)", () => {
    expect(variantWidthsFor(2000)).toEqual([480, 960, 1440]);
    expect(variantWidthsFor(1440)).toEqual([480, 960]);
    expect(variantWidthsFor(600)).toEqual([480]);
    expect(variantWidthsFor(480)).toEqual([]);
  });

  it("makeVariants de uma imagem de 2000 px devolve 3 larguras em WebP", async () => {
    const out = await makeVariants(await image(2000, 1125));
    expect(out.map((v) => v.width)).toEqual([480, 960, 1440]);
    for (const v of out) {
      const meta = await sharp(v.buf).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(v.width);
    }
  });

  it("makeVariants de uma imagem de 600 px devolve só 480 (sem ampliar)", async () => {
    const out = await makeVariants(await image(600, 400));
    expect(out.map((v) => v.width)).toEqual([480]);
  });

  it("makeVariants de arquivo inválido devolve lista vazia (o original continua servindo)", async () => {
    expect(await makeVariants(Buffer.from("não é imagem"))).toEqual([]);
  });

  it("escolhe a menor variante ≥ w que exista; acima da maior ou sem pedido, o original", () => {
    expect(pickVariantWidth(300, 2000)).toBe(480);
    expect(pickVariantWidth(480, 2000)).toBe(480);
    expect(pickVariantWidth(700, 2000)).toBe(960);
    expect(pickVariantWidth(1440, 2000)).toBe(1440);
    expect(pickVariantWidth(1600, 2000)).toBeNull();
    // Original de 600 px: só existe a de 480; pedir 960 cai no original.
    expect(pickVariantWidth(960, 600)).toBeNull();
    // Largura desconhecida: tenta a variante (a rota cai no original se faltar).
    expect(pickVariantWidth(960, null)).toBe(960);
    for (const bad of [Number.NaN, 0, -5]) expect(pickVariantWidth(bad, 2000)).toBeNull();
  });

  it("srcset só para a rota de mídia, com as três larguras", () => {
    const src = `/api/media/${ID}`;
    expect(mediaSrcSet(src)).toBe(`${src}?w=480 480w, ${src}?w=960 960w, ${src}?w=1440 1440w`);
    expect(mediaSrcSet("/icons/x.png")).toBeUndefined();
    expect(mediaSrcSet("https://exemplo.com/foto.jpg")).toBeUndefined();
    expect(mediaSrcSet(`${src}?w=480`)).toBeUndefined();
  });

  it("saveVariants grava cada variante ao lado do original e relata falhas sem lançar", async () => {
    const store = createMemoryMediaStore();
    const make = async () => [
      { width: 480, buf: Buffer.from([1]) },
      { width: 960, buf: Buffer.from([2]) },
    ];
    const r = await saveVariants(store, "original/abc.jpg", new Uint8Array([9]), make);
    expect(r).toEqual({ saved: [480, 960], failed: [] });
    expect([...store.files.keys()].sort()).toEqual([
      "original/abc.w480.webp",
      "original/abc.w960.webp",
    ]);
    expect(store.files.get("original/abc.w480.webp")?.contentType).toBe("image/webp");

    const failing = createMemoryMediaStore({ failPut: true });
    expect(await saveVariants(failing, "original/abc.jpg", new Uint8Array([9]), make)).toEqual({
      saved: [],
      failed: [480, 960],
    });
    const throwing = async () => {
      throw new Error("sharp");
    };
    expect(await saveVariants(store, "original/x.jpg", new Uint8Array([9]), throwing)).toEqual({
      saved: [],
      failed: [...VARIANT_WIDTHS],
    });
  });
});
