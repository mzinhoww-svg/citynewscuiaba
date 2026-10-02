// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hamming } from "@/lib/pipeline/simhash";
import { analyzeImage } from "./analyze";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/images", name)));

async function analyzed(name: string) {
  const r = await analyzeImage(fixture(name));
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("analyzeImage (fixtures, sem rede)", () => {
  it("mede JPEG e PNG", async () => {
    expect(await analyzed("reproducao-1600x900.jpg")).toMatchObject({
      format: "jpeg",
      contentType: "image/jpeg",
      width: 1600,
      height: 900,
    });
    expect(await analyzed("acervo-ilustrativa-1600x1067.png")).toMatchObject({
      format: "png",
      width: 1600,
      height: 1067,
    });
  });

  it("hash perceptual: mesma foto recomprimida fica perto; outra imagem, longe", async () => {
    const a = await analyzed("reproducao-1600x900.jpg");
    const b = await analyzed("reproducao-recomprimida-1400x788.jpg");
    const c = await analyzed("acervo-ilustrativa-1600x1067.png");
    expect(hamming(a.phash, b.phash)).toBeLessThanOrEqual(8);
    expect(hamming(a.phash, c.phash)).toBeGreaterThan(8);
    expect(a.sha256).not.toBe(b.sha256);
  });

  it("recusa SVG e bytes que não são imagem", async () => {
    expect(await analyzeImage(fixture("vetor.svg"))).toEqual({
      ok: false,
      error: expect.stringMatching(/formato/),
    });
    expect((await analyzeImage(new TextEncoder().encode("<html>oi</html>"))).ok).toBe(false);
  });
});
