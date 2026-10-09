import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import {
  buildSocialPackage,
  isSlidePath,
  slidePath,
  type BuildDeps,
  type PackageStatus,
  type PackageWrite,
  type StoredPackage,
} from "./build-package";
import type { WeekEvent } from "./pick-week";
import type { SlidesInput } from "./slides";

const MONDAY = new Date("2026-10-12T12:00:00Z");
const ASSET = "00000000-0000-4000-8000-0000000000aa";

let n = 0;
const ev = (over: Partial<WeekEvent> = {}): WeekEvent => {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    slug: `evento-${n}`,
    title: `Evento ${n}`,
    startsAt: `2026-10-1${3 + (n % 4)}T23:00:00Z`,
    endsAt: null,
    venue: `Lugar ${n}`,
    neighborhood: null,
    venueSlug: null,
    priceCents: 0,
    isFree: true,
    priceUnknown: false,
    origin: "organizer",
    sourceName: "Fonte Exemplo",
    confirmedByName: null,
    confirmed: true,
    confirmedAt: "2026-10-01T12:00:00Z",
    image: null,
    ...over,
  };
};

function fakeDeps(events: WeekEvent[], start: StoredPackage | null = null) {
  let row = start;
  const files = new Map<string, Uint8Array>();
  const audits: Record<string, unknown>[] = [];
  let g = 0;
  const deps: BuildDeps = {
    now: MONDAY,
    generation: () => {
      g += 1;
      return { id: `g${g}`, at: `2026-10-12T12:00:0${g}.000Z` };
    },
    loadEvents: async () => events,
    loadImage: async (id) => (id === ASSET ? new Uint8Array([9]) : null),
    render: vi.fn(async (input: SlidesInput) =>
      ok({
        pngs: Array.from({ length: input.items.length + 2 }, () => new Uint8Array([1])),
        withImage: input.items.filter((i) => input.images.has(i.eventId)).map((i) => i.eventId),
        clamped: [],
      }),
    ),
    find: async () => row,
    save: async (w: PackageWrite, allowFrom: readonly PackageStatus[], seen: string | null) => {
      if (row && !allowFrom.includes(row.status)) return null;
      if ((row?.generatedAt ?? null) !== seen) return null;
      row = {
        id: "p1",
        weekStart: w.weekStart,
        status: "draft",
        items: w.items,
        caption: w.caption,
        assets: w.assets,
        error: w.error,
        excluded: w.excluded,
        approvedBy: null,
        approvedAt: null,
        publishedUrl: null,
        generatedAt: w.generatedAt,
      };
      return row;
    },
    upload: async (path, bytes) => {
      files.set(path, bytes);
      return ok(undefined);
    },
    remove: async (paths) => {
      for (const p of paths) files.delete(p);
    },
    audit: async (_ref, details) => {
      audits.push(details);
    },
  };
  return { deps, files, audits, row: () => row };
}

describe("buildSocialPackage", () => {
  it("monta itens, legenda e PNGs em {segunda}/{geração}/NN.png e audita", async () => {
    const f = fakeDeps([
      ev(),
      ev({
        image: { src: `/api/media/${ASSET}`, alt: "", kind: "reproduction", credit: "Fonte A" },
      }),
    ]);
    const r = await buildSocialPackage(f.deps);
    expect(r).toMatchObject({
      outcome: "built",
      status: "draft",
      events: 2,
      slides: 4,
      withImage: 1,
    });
    expect([...f.files.keys()]).toEqual([
      "2026-10-12/g1/01.png",
      "2026-10-12/g1/02.png",
      "2026-10-12/g1/03.png",
      "2026-10-12/g1/04.png",
    ]);
    expect(f.row()?.generatedAt).toBe("2026-10-12T12:00:01.000Z");
    expect(f.row()?.caption).toContain("Fotos: reprodução web · Fonte A");
    expect(f.audits).toHaveLength(1);
    expect(slidePath("2026-10-12", "ab12", 9)).toBe("2026-10-12/ab12/10.png");
    expect(isSlidePath("2026-10-12", "2026-10-12/ab12/10.png")).toBe(true);
    for (const bad of ["2026-10-19/ab12/10.png", "2026-10-12/../x/01.png", "2026-10-12/01.png"])
      expect(isSlidePath("2026-10-12", bad)).toBe(false);
  });

  it("sem eventos: rascunho vazio, sem render", async () => {
    const f = fakeDeps([]);
    const r = await buildSocialPackage(f.deps);
    expect(r.outcome).toBe("empty");
    expect(f.row()).toMatchObject({ status: "draft", items: [], assets: [] });
    expect(f.deps.render).not.toHaveBeenCalled();
  });

  it("render falhou: rascunho com o erro, sem PNG", async () => {
    const f = fakeDeps([ev()]);
    f.deps.render = async () => err("fonte ausente");
    const r = await buildSocialPackage(f.deps);
    expect(r.outcome).toBe("failed");
    expect(f.row()).toMatchObject({ status: "draft", error: "render: fonte ausente", assets: [] });
    expect(f.files.size).toBe(0);
  });

  it("foto que não carregou sai dos créditos", async () => {
    const f = fakeDeps([
      ev({
        image: {
          src: `/api/media/00000000-0000-4000-8000-0000000000bb`,
          alt: "",
          kind: "reproduction",
          credit: "Fonte B",
        },
      }),
    ]);
    await buildSocialPackage(f.deps);
    expect(f.row()?.items[0]?.image).toBeNull();
    expect(f.row()?.caption).not.toContain("Fonte B");
  });

  it.each(["approved", "published", "discarded"] as const)(
    "pacote %s não é tocado pelo job",
    async (status) => {
      const f = fakeDeps([ev()], {
        id: "p1",
        weekStart: "2026-10-12",
        status,
        items: [],
        caption: "aprovada",
        assets: ["2026-10-12/01.png"],
        error: null,
        excluded: [],
        approvedBy: "u",
        approvedAt: "2026-10-12T13:00:00Z",
        publishedUrl: null,
        generatedAt: null,
      });
      const r = await buildSocialPackage(f.deps);
      expect(r).toMatchObject({ outcome: "skipped", status });
      expect(f.row()?.caption).toBe("aprovada");
      expect(f.deps.render).not.toHaveBeenCalled();
    },
  );

  it("aprovado no meio da rodada: save não grava, os PNGs novos somem e os do aprovado ficam", async () => {
    const f = fakeDeps([ev(), ev()]);
    await buildSocialPackage(f.deps);
    const approvedFiles = [...f.files.keys()];
    expect(approvedFiles).toHaveLength(4);
    // A segunda rodada lê o rascunho; antes de gravar, alguém aprova (save devolve null).
    const save = f.deps.save;
    f.deps.save = async (w, allowFrom, seen) => {
      const r = f.row();
      if (r) r.status = "approved";
      return save(w, allowFrom, seen);
    };
    const report = await buildSocialPackage(f.deps);
    expect(report).toMatchObject({ outcome: "skipped", status: "approved" });
    expect([...f.files.keys()]).toEqual(approvedFiles);
    expect(f.row()?.assets).toEqual(approvedFiles);
  });

  it("outra rodada gravou antes (geração diferente): esta não sobrescreve nem apaga a outra", async () => {
    const f = fakeDeps([ev()]);
    await buildSocialPackage(f.deps);
    const save = f.deps.save;
    f.deps.save = async (w, allowFrom, seen) => {
      const r = f.row();
      if (r) r.generatedAt = "outra-geracao";
      return save(w, allowFrom, seen);
    };
    const before = [...f.files.keys()];
    expect((await buildSocialPackage(f.deps)).outcome).toBe("skipped");
    expect([...f.files.keys()]).toEqual(before);
  });

  it("upload falhou no meio: apaga o que subiu desta geração e grava o erro", async () => {
    const f = fakeDeps([ev(), ev()]);
    let n = 0;
    const upload = f.deps.upload;
    f.deps.upload = async (path, bytes) => {
      n += 1;
      return n === 3 ? err("sem rede") : upload(path, bytes);
    };
    const r = await buildSocialPackage(f.deps);
    expect(r.outcome).toBe("failed");
    expect(f.files.size).toBe(0);
    expect(f.row()?.error).toBe("upload: sem rede");
  });

  it("título cortado fica marcado no item", async () => {
    const events = [ev()];
    const f = fakeDeps(events);
    f.deps.render = async (input) =>
      ok({
        pngs: Array.from({ length: input.items.length + 2 }, () => new Uint8Array([1])),
        withImage: [],
        clamped: [events[0]!.id],
      });
    const r = await buildSocialPackage(f.deps);
    expect(r.clamped).toEqual([events[0]!.id]);
    expect(f.row()?.items[0]?.titleClamped).toBe(true);
  });

  it("nova geração: os PNGs da anterior são apagados; exclusões ficam gravadas", async () => {
    const events = [ev(), ev(), ev()];
    const f = fakeDeps(events);
    await buildSocialPackage(f.deps);
    expect(f.files.size).toBe(5);
    await buildSocialPackage(f.deps, { exclude: [events[0]!.id] });
    expect(f.files.size).toBe(4);
    expect([...f.files.keys()].every((p) => p.includes("/g2/"))).toBe(true);
    expect(f.row()?.excluded).toEqual([events[0]!.id]);
    // A rodada seguinte do job mantém a exclusão.
    await buildSocialPackage(f.deps);
    expect(f.row()?.items.map((i) => i.eventId)).not.toContain(events[0]!.id);
  });
});
