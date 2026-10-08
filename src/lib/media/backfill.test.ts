import { describe, expect, it, vi } from "vitest";
import { backfillVariants } from "./backfill";
import { createMemoryMediaStore } from "./store";

const assets = [
  { id: "a", storagePath: "original/a.jpg" },
  { id: "b", storagePath: "original/b.jpg" },
  { id: "c", storagePath: "original/c.jpg" },
];

describe("backfillVariants (A-155)", () => {
  it("grava as variantes que faltam, pula as completas e conta o original ilegível", async () => {
    const store = createMemoryMediaStore();
    await store.put("original/a.jpg", new Uint8Array([1]), "image/jpeg");
    await store.put("original/a.w480.webp", new Uint8Array([2]), "image/webp");
    await store.put("original/b.jpg", new Uint8Array([3]), "image/jpeg");
    const make = vi.fn(async () => [
      { width: 480, buf: new Uint8Array([4]) },
      { width: 960, buf: new Uint8Array([5]) },
    ]);
    const r = await backfillVariants(
      { page: async (o, l) => assets.slice(o, o + l), store, make },
      0,
      3,
    );
    expect(r).toEqual({
      assets: 3,
      complete: 1,
      written: 2,
      failed: 0,
      unreadable: 1,
      nextOffset: 3,
    });
    expect(make).toHaveBeenCalledTimes(1);
    expect((await store.read("original/b.w960.webp")).ok).toBe(true);
  });

  it("página incompleta encerra (nextOffset null); imagem pequena não grava nada", async () => {
    const store = createMemoryMediaStore();
    await store.put("original/c.jpg", new Uint8Array([1]), "image/jpeg");
    const r = await backfillVariants(
      { page: async (o) => assets.slice(2 + o, 3), store, make: async () => [] },
      0,
      10,
    );
    expect(r).toMatchObject({ assets: 1, written: 0, unreadable: 1, nextOffset: null });
  });
});
