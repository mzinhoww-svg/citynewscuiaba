// backfill-variants (UX-W5-T1): partes puras e o fluxo com dependências falsas.
import { describe, expect, it } from "vitest";
import * as lib from "../../src/lib/media/variants";
import {
  VARIANT_WIDTHS,
  applyGuard,
  parseArgs,
  run,
  variantPath,
  variantWidthsFor,
} from "./backfill-variants.mjs";

describe("backfill-variants: paridade com src/lib/media/variants.ts", () => {
  it("mesmas larguras e mesmo caminho", () => {
    expect([...VARIANT_WIDTHS]).toEqual([...lib.VARIANT_WIDTHS]);
    for (const p of ["original/abc.jpg", "reproducao/x.png", "teste/sem-extensao"])
      for (const w of VARIANT_WIDTHS) expect(variantPath(p, w)).toBe(lib.variantPath(p, w));
    expect(variantWidthsFor(600)).toEqual(lib.variantWidthsFor(600));
  });
});

describe("backfill-variants: argumentos", () => {
  it("ensaio é o padrão; --apply é explícito e não convive com --dry-run", () => {
    expect(parseArgs([])).toMatchObject({ apply: false, batch: 100 });
    expect(parseArgs(["--apply"]).apply).toBe(true);
    expect(() => parseArgs(["--apply", "--dry-run"])).toThrow();
    expect(() => parseArgs(["--aply"])).toThrow(/desconhecida/);
  });

  it("--apply fora do banco local exige --confirm-host", () => {
    const prod = "https://abc.supabase.co";
    expect(applyGuard(prod, parseArgs([]))).toBeNull();
    expect(applyGuard(prod, parseArgs(["--apply"]))).toMatch(/--confirm-host=abc\.supabase\.co/);
    expect(applyGuard(prod, parseArgs(["--apply", "--confirm-host=abc.supabase.co"]))).toBeNull();
    expect(applyGuard("http://127.0.0.1:54321", parseArgs(["--apply"]))).toBeNull();
  });
});

function fakeDeps(assets: { id: string; storagePath: string; width: number | null }[]) {
  const files = new Map<string, Uint8Array>();
  for (const a of assets) files.set(a.storagePath, new Uint8Array([1]));
  const uploads: string[] = [];
  return {
    files,
    uploads,
    deps: {
      listAssets: async (offset: number, limit: number) => assets.slice(offset, offset + limit),
      exists: async (p: string) => files.has(p),
      download: async (p: string) => files.get(p) ?? null,
      upload: async (p: string, b: Uint8Array) => {
        uploads.push(p);
        files.set(p, b);
        return true;
      },
      measure: async () => 1000,
      resize: async (_b: Uint8Array, w: number) => new Uint8Array([w % 256]),
    },
  };
}

describe("backfill-variants: execução", () => {
  const assets = [
    { id: "a", storagePath: "original/a.jpg", width: 2000 },
    { id: "b", storagePath: "reproducao/b.jpg", width: 600 },
    { id: "c", storagePath: "original/c.jpg", width: null },
  ];

  it("ensaio não grava nada e conta o que falta", async () => {
    const f = fakeDeps(assets);
    const r = await run(parseArgs([]), f.deps);
    expect(f.uploads).toEqual([]);
    expect(r).toMatchObject({ mode: "dry-run", assets: 3, planned: 3 + 1 + 3, written: 0 });
  });

  it("--apply grava só as que faltam, sem ampliar, e é idempotente", async () => {
    const f = fakeDeps(assets);
    const first = await run(parseArgs(["--apply", "--batch=2"]), f.deps);
    expect(f.uploads.sort()).toEqual(
      [
        "original/a.w480.webp",
        "original/a.w960.webp",
        "original/a.w1440.webp",
        "reproducao/b.w480.webp",
        // c sem largura registrada: medido em 1000 px, só 480 e 960.
        "original/c.w480.webp",
        "original/c.w960.webp",
      ].sort(),
    );
    expect(first).toMatchObject({ assets: 3, written: 6, failed: 0 });

    f.uploads.length = 0;
    const second = await run(parseArgs(["--apply"]), f.deps);
    expect(f.uploads).toEqual([]);
    expect(second).toMatchObject({ complete: 2, written: 0 });
  });

  it("arquivo sumido do Storage é relatado, sem parar o lote", async () => {
    const f = fakeDeps(assets);
    f.files.delete("original/a.jpg");
    const r = await run(parseArgs(["--apply", "--limit=2"]), f.deps);
    expect(r).toMatchObject({ assets: 2, unreadable: 1, written: 1 });
  });
});
