import { describe, expect, it } from "vitest";
import { DUPLICATE_MAX_DISTANCE } from "./checks";
import { inlinePosition, pickCoverAndInline, scoreImage } from "./score";
import type { Candidate } from "./types";

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  url: "https://folhadocerrado.example/materia",
  imageUrl: "https://folhadocerrado.example/img/a.jpg",
  sourceId: "src-a",
  sourceName: "Folha do Cerrado",
  width: 1600,
  height: 900,
  phashDistances: [],
  watermark: false,
  ...over,
});

describe("scoreImage", () => {
  it("fica entre 0 e 100", () => {
    for (const c of [
      cand(),
      cand({ width: 300, height: 300 }),
      cand({ width: 6000, height: 3375 }),
    ]) {
      const s = scoreImage(c);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it("maior resolução paisagem vence", () => {
    const big = scoreImage(cand({ width: 2400, height: 1350 }));
    const mid = scoreImage(cand({ width: 1200, height: 675 }));
    const small = scoreImage(cand({ width: 800, height: 450 }));
    expect(big).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(small);
  });

  it("largura abaixo de 600 reprova (nota 0)", () => {
    expect(scoreImage(cand({ width: 599, height: 337 }))).toBe(0);
  });

  it("paisagem entre 16:9 e 3:2 é melhor que quadrada, e retrato perde para paisagem", () => {
    const wide = scoreImage(cand({ width: 1600, height: 900 }));
    const threeTwo = scoreImage(cand({ width: 1500, height: 1000 }));
    const square = scoreImage(cand({ width: 1600, height: 1600 }));
    const portrait = scoreImage(cand({ width: 1200, height: 1800 }));
    expect(wide).toBeGreaterThan(square);
    expect(threeTwo).toBeGreaterThan(square);
    expect(square).toBeGreaterThan(portrait);
    expect(wide).toBeGreaterThan(portrait + 15);
  });

  it("marca d'água suspeita e título sensacionalista penalizam", () => {
    const clean = scoreImage(cand());
    expect(scoreImage(cand({ watermark: true }))).toBeLessThan(clean);
    expect(scoreImage(cand({ sensational: true }))).toBeLessThan(clean);
  });

  it("nitidez entra só quando existe", () => {
    const none = scoreImage(cand());
    const sharp = scoreImage(cand({ sharpness: 1 }));
    const blurry = scoreImage(cand({ sharpness: 0 }));
    expect(sharp).toBeGreaterThanOrEqual(none);
    expect(blurry).toBeLessThan(none);
  });
});

describe("pickCoverAndInline", () => {
  const a = cand({
    sourceId: "a",
    sourceName: "A",
    imageUrl: "https://a.example/1.jpg",
    width: 2400,
    height: 1350,
    phash: 0n,
  });
  const b = cand({
    sourceId: "b",
    sourceName: "B",
    imageUrl: "https://b.example/1.jpg",
    width: 1500,
    height: 1000,
    phash: (1n << 40n) - 1n,
  });
  const c = cand({
    sourceId: "c",
    sourceName: "C",
    imageUrl: "https://c.example/1.jpg",
    width: 1300,
    height: 731,
    phash: 0xffffn << 20n,
  });

  it("com 3 candidatas de 3 fontes escolhe capa e imagem do texto distintas", () => {
    const r = pickCoverAndInline([c, b, a]);
    expect(r.cover).toBe(a);
    expect(r.inline).toBe(b);
  });

  it("duas da mesma fonte não formam par", () => {
    const a2 = { ...a, imageUrl: "https://a.example/2.jpg", width: 2000 };
    const r = pickCoverAndInline([a, a2]);
    expect(r.cover).toBe(a);
    expect(r.inline).toBeUndefined();
  });

  it("a segunda é de outra fonte quando a melhor segunda é da mesma fonte da capa", () => {
    const a2 = { ...a, imageUrl: "https://a.example/2.jpg", width: 2000 };
    const r = pickCoverAndInline([a, a2, c]);
    expect(r.cover).toBe(a);
    expect(r.inline).toBe(c);
  });

  it("duas quase iguais (phash próximo) não formam par", () => {
    const near = { ...b, phash: 3n };
    expect(DUPLICATE_MAX_DISTANCE).toBeGreaterThanOrEqual(3);
    const r = pickCoverAndInline([a, near]);
    expect(r.cover).toBe(a);
    expect(r.inline).toBeUndefined();
  });

  it("phash a mais que DUPLICATE_MAX_DISTANCE da capa pode formar par", () => {
    const far = { ...b, phash: (1n << BigInt(DUPLICATE_MAX_DISTANCE + 1)) - 1n };
    expect(pickCoverAndInline([a, far]).inline).toBe(far);
  });

  it("sem phash conhecido não bloqueia o par", () => {
    const noHash: Candidate = { ...b, phash: undefined };
    expect(pickCoverAndInline([a, noHash]).inline).toBe(noHash);
  });

  it("1 candidata dá só a capa; 0 dá nenhuma", () => {
    expect(pickCoverAndInline([a])).toEqual({ cover: a });
    expect(pickCoverAndInline([])).toEqual({});
  });

  it("candidata com nota 0 (largura < 600) nunca é escolhida", () => {
    const tiny = cand({ width: 400, height: 225 });
    expect(pickCoverAndInline([tiny])).toEqual({});
    expect(pickCoverAndInline([a, tiny]).inline).toBeUndefined();
  });

  it("com capa já fixada, escolhe só a imagem do texto, de outra fonte e outra foto", () => {
    const r = pickCoverAndInline([a, b, c], { cover: a });
    expect(r.cover).toBeUndefined();
    expect(r.inline).toBe(b);
    const same = pickCoverAndInline([a], { cover: a });
    expect(same.inline).toBeUndefined();
  });

  it("empate de nota é estável (a primeira da lista vence)", () => {
    const x = cand({ sourceId: "x", imageUrl: "https://x.example/1.jpg" });
    const y = cand({ sourceId: "y", imageUrl: "https://y.example/1.jpg" });
    expect(pickCoverAndInline([x, y]).cover).toBe(x);
    expect(pickCoverAndInline([y, x]).cover).toBe(y);
  });
});

describe("inlinePosition", () => {
  it("4 ou mais parágrafos: depois do 3º", () => {
    expect(inlinePosition(4)).toBe(3);
    expect(inlinePosition(5)).toBe(3);
    expect(inlinePosition(12)).toBe(3);
  });
  it("2 ou 3 parágrafos: depois do 2º", () => {
    expect(inlinePosition(2)).toBe(2);
    expect(inlinePosition(3)).toBe(2);
  });
  it("menos de 2 parágrafos: sem imagem no texto", () => {
    expect(inlinePosition(1)).toBeNull();
    expect(inlinePosition(0)).toBeNull();
    expect(inlinePosition(-1)).toBeNull();
    expect(inlinePosition(Number.NaN)).toBeNull();
  });
});
