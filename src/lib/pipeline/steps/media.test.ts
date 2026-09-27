// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeImage } from "@/lib/media/analyze";
import { createMemoryMediaStore } from "@/lib/media/store";
import { takedownReproduction } from "@/lib/media/takedown";
import type { FlagKey, MediaSourceItem } from "../ports";
import { createFakeHttp, type FakeRoute, fakeResolve } from "../testing/fake-http";
import { createMemoryMediaRepo } from "../testing/memory-media-repo";
import type { PipelineMessage } from "../types";
import { createMediaStep } from "./media";

const NOW = new Date("2026-09-27T18:00:00Z");
const image = (name: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/images", name)));
const jpeg = (name: string): FakeRoute => ({
  body: image(name),
  headers: { "content-type": "image/jpeg" },
});

const msg: PipelineMessage = { runId: "r1", step: "image", itemRef: "article:a1", attempt: 1 };

function sourceItem(
  over: Partial<MediaSourceItem["source"]> = {},
  item: Partial<MediaSourceItem> = {},
): MediaSourceItem {
  return {
    itemId: "i1",
    title: "Feira de artesanato ocupa a Orla do Porto neste fim de semana",
    imageUrl: "https://folhadocerrado.example/img/feira.jpg",
    pageUrl: "https://folhadocerrado.example/cultura/feira-orla-do-porto",
    author: "Ana Prado",
    ...item,
    source: {
      id: "src-folha",
      slug: "folha-do-cerrado",
      name: "Folha do Cerrado",
      baseUrl: "https://folhadocerrado.example",
      imagePolicy: "reproduction",
      agreementUntil: null,
      rateLimitPerHour: 60,
      ...over,
    },
  };
}

function setup(opts: {
  items?: MediaSourceItem[];
  flags?: Partial<Record<FlagKey, boolean>>;
  routes?: Record<string, FakeRoute>;
  category?: string;
  failPut?: boolean;
}) {
  const repo = createMemoryMediaRepo();
  repo.setContext({
    articleId: "a1",
    topicId: "t1",
    title: "Feira de artesanato ocupa a Orla do Porto",
    sectionSlug: opts.category ?? "cultura",
    category: opts.category ?? "cultura",
    sensitive: false,
    tags: [],
    items: opts.items ?? [sourceItem()],
  });
  const store = createMemoryMediaStore({ failPut: opts.failPut });
  const { http, calls } = createFakeHttp({
    "https://folhadocerrado.example/robots.txt": { status: 404 },
    "https://folhadocerrado.example/img/feira.jpg": jpeg("reproducao-1600x900.jpg"),
    ...opts.routes,
  });
  const flags = { image_reproduction_enabled: true, ...opts.flags };
  const step = createMediaStep({
    repo,
    store,
    flags: { isEnabled: async (k) => flags[k] ?? false },
    http,
    resolve: fakeResolve(),
    userAgent: "CityNewsBot/1.0",
    now: () => NOW,
    analyze: analyzeImage,
  });
  return { repo, store, step, calls };
}

describe("etapa de imagem (13 e 14)", () => {
  it("reproduction: copia a imagem com proveniência, crédito e link, e liga à matéria", async () => {
    const { repo, store, step } = setup({});
    const r = await step(msg);
    expect(r).toEqual({ ok: true, value: [{ ...msg, step: "rules" }] });
    const [asset] = repo.assets();
    expect(asset).toMatchObject({
      kind: "reproduction",
      status: "approved",
      originUrl: "https://folhadocerrado.example/img/feira.jpg",
      credit: "Ana Prado",
      width: 1600,
      height: 900,
      sourceId: "src-folha",
    });
    expect(asset!.details).toMatchObject({
      pageUrl: "https://folhadocerrado.example/cultura/feira-orla-do-porto",
      sourceName: "Folha do Cerrado",
      contentType: "image/jpeg",
      provenance: expect.objectContaining({
        policy: "reproduction",
        imageUrl: "https://folhadocerrado.example/img/feira.jpg",
        fetchedAt: NOW.toISOString(),
        unmodified: true,
      }),
    });
    expect(asset!.storagePath).toMatch(/^reproducao\/[0-9a-f]{64}\.jpg$/);
    // Cópia byte a byte: sem recorte de crédito nem de marca.
    expect(store.files.get(asset!.storagePath)?.bytes).toEqual(image("reproducao-1600x900.jpg"));
    expect(repo.links()).toEqual([
      expect.objectContaining({ articleId: "a1", mediaId: asset!.id, chosenBy: "pipeline:image" }),
    ]);
    expect(repo.decisions()[0]).toMatchObject({
      objectRef: "article:a1",
      step: "image",
      output: expect.objectContaining({
        kind: "reproduction",
        label: "REPRODUÇÃO · Folha do Cerrado · Ana Prado",
      }),
    });
  });

  it("flag image_reproduction_enabled desligada: nada é baixado; cai para o acervo", async () => {
    const { repo, step, calls } = setup({ flags: { image_reproduction_enabled: false } });
    repo.addArchive({ id: "acervo-1", tags: ["cultura"] });
    expect((await step(msg)).ok).toBe(true);
    expect(calls).toHaveLength(0);
    expect(repo.links()).toEqual([expect.objectContaining({ mediaId: "acervo-1" })]);
    expect(repo.decisions()[0]!.output).toMatchObject({ kind: "illustrative" });
    expect(repo.decisions()[0]!.rationale).toMatch(/reprodução desligada/);
  });

  it("política none nunca baixa a imagem; sem acervo, card tipográfico", async () => {
    const { repo, step, calls } = setup({ items: [sourceItem({ imagePolicy: "none" })] });
    expect((await step(msg)).ok).toBe(true);
    expect(calls).toHaveLength(0);
    expect(repo.links()).toEqual([]);
    expect(repo.decisions()[0]!.output).toMatchObject({ kind: "typographic" });
  });

  it("acordo vencido não usa a foto; acordo vigente usa como original", async () => {
    const expired = setup({
      items: [sourceItem({ imagePolicy: "with_agreement", agreementUntil: "2026-09-01" })],
    });
    await expired.step(msg);
    expect(expired.repo.decisions()[0]!.output).toMatchObject({ kind: "typographic" });
    expect(expired.calls).toHaveLength(0);

    const valid = setup({
      items: [sourceItem({ imagePolicy: "with_agreement", agreementUntil: "2026-12-31" })],
    });
    await valid.step(msg);
    expect(valid.repo.assets()[0]).toMatchObject({ kind: "original", status: "approved" });
  });

  it("baixa resolução reprova e tenta o próximo item", async () => {
    const { repo, step } = setup({
      items: [
        sourceItem(
          {},
          { itemId: "i1", imageUrl: "https://folhadocerrado.example/img/pequena.jpg" },
        ),
        sourceItem({}, { itemId: "i2" }),
      ],
      routes: {
        "https://folhadocerrado.example/img/pequena.jpg": jpeg("baixa-resolucao-800x450.jpg"),
      },
    });
    await step(msg);
    expect(repo.assets().map((a) => a.originUrl)).toEqual([
      "https://folhadocerrado.example/img/feira.jpg",
    ]);
    expect(repo.decisions()[0]!.rationale).toMatch(/low_res/);
  });

  it("robots.txt que bloqueia a imagem impede a cópia", async () => {
    const { repo, step } = setup({
      routes: {
        "https://folhadocerrado.example/robots.txt": { body: "User-agent: *\nDisallow: /img/" },
      },
    });
    await step(msg);
    expect(repo.assets()).toEqual([]);
    expect(repo.decisions()[0]!.rationale).toMatch(/robots/);
  });

  it("imagem de outro domínio é descartada com motivo, sem nenhum acesso", async () => {
    const { repo, step, calls } = setup({
      items: [sourceItem({}, { imageUrl: "https://cdn.terceiro.example/feira.jpg" })],
    });
    await step(msg);
    expect(repo.assets()).toEqual([]);
    expect(calls).toEqual([]);
    expect(repo.decisions()[0]!.rationale).toMatch(/fora do domínio da fonte/);
  });

  it("subdomínio da fonte vale; redirecionamento para fora do domínio é recusado", async () => {
    const sub = setup({
      items: [sourceItem({}, { imageUrl: "https://img.folhadocerrado.example/feira.jpg" })],
      routes: {
        "https://img.folhadocerrado.example/robots.txt": { status: 404 },
        "https://img.folhadocerrado.example/feira.jpg": jpeg("reproducao-1600x900.jpg"),
      },
    });
    await sub.step(msg);
    expect(sub.repo.assets()).toHaveLength(1);

    const redirected = setup({
      routes: {
        "https://folhadocerrado.example/img/feira.jpg": {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        },
      },
    });
    await redirected.step(msg);
    expect(redirected.repo.assets()).toEqual([]);
    expect(redirected.calls.map((c) => c.url)).not.toContain(
      "http://169.254.169.254/latest/meta-data",
    );
    expect(redirected.repo.decisions()[0]!.rationale).toMatch(/fora do domínio|não permitido/);
  });

  it("SVG ou resposta que não é imagem é ignorada", async () => {
    const { repo, step } = setup({
      routes: {
        "https://folhadocerrado.example/img/feira.jpg": {
          body: image("vetor.svg"),
          headers: { "content-type": "image/svg+xml" },
        },
      },
    });
    await step(msg);
    expect(repo.assets()).toEqual([]);
  });

  it("mesma foto já copiada de outra origem é duplicada; mesma origem é reutilizada", async () => {
    const { repo, step } = setup({});
    await step(msg);
    repo.setContext({
      articleId: "a2",
      topicId: "t2",
      title: "Outra matéria",
      sectionSlug: "cultura",
      category: "cultura",
      sensitive: false,
      tags: [],
      items: [
        sourceItem({}, { imageUrl: "https://folhadocerrado.example/img/copia.jpg" }),
        sourceItem(),
      ],
    });
    const other = createMediaStep({
      repo,
      store: createMemoryMediaStore(),
      flags: { isEnabled: async () => true },
      http: createFakeHttp({
        "https://folhadocerrado.example/img/copia.jpg": jpeg(
          "reproducao-recomprimida-1400x788.jpg",
        ),
      }).http,
      resolve: fakeResolve(),
      userAgent: "CityNewsBot/1.0",
      now: () => NOW,
      analyze: analyzeImage,
    });
    await other({ ...msg, itemRef: "article:a2" });
    expect(repo.assets()).toHaveLength(1);
    expect(repo.links().map((l) => [l.articleId, l.mediaId])).toEqual([
      ["a1", "m-1"],
      ["a2", "m-1"],
    ]);
  });

  it("imagem removida a pedido nunca volta a ser copiada", async () => {
    const { repo, step, store } = setup({});
    await step(msg);
    const r = await takedownReproduction(
      { repo, store, revalidate: async () => {}, now: () => NOW },
      { sourceId: "src-folha" },
      "c1000000-0000-4000-8000-000000000002",
      "Pedido do veículo por e-mail",
    );
    expect(r).toEqual({ ok: true, value: { blocked: 1, articleIds: ["a1"] } });
    repo.setContext({
      articleId: "a3",
      topicId: "t3",
      title: "Mais uma",
      sectionSlug: "cultura",
      category: "cultura",
      sensitive: false,
      tags: [],
      items: [sourceItem()],
    });
    await step({ ...msg, itemRef: "article:a3" });
    expect(repo.links().filter((l) => l.articleId === "a3")).toEqual([]);
  });

  it("falha do Storage é transitória (nova tentativa), sem ligar mídia", async () => {
    const { repo, step } = setup({ failPut: true });
    const r = await step(msg);
    expect(r).toEqual({ ok: false, error: expect.objectContaining({ kind: "transient" }) });
    expect(repo.links()).toEqual([]);
  });

  it("matéria que já tem imagem segue direto (idempotente)", async () => {
    const { repo, step, calls } = setup({});
    await step(msg);
    const n = calls.length;
    expect(await step(msg)).toEqual({ ok: true, value: [{ ...msg, step: "rules" }] });
    expect(calls.length).toBe(n);
    expect(repo.decisions()).toHaveLength(1);
  });
});

describe("takedownReproduction (remoção em 24 h)", () => {
  it("bloqueia, apaga a cópia, invalida as páginas e audita", async () => {
    const { repo, step, store } = setup({});
    await step(msg);
    const path = repo.assets()[0]!.storagePath;
    const tags: string[] = [];
    const r = await takedownReproduction(
      { repo, store, revalidate: async (t) => void tags.push(...t), now: () => NOW },
      { mediaId: "m-1" },
      "c1000000-0000-4000-8000-000000000002",
      "Veículo pediu remoção",
    );
    expect(r.ok).toBe(true);
    expect(repo.assets()[0]!.status).toBe("blocked");
    expect(store.files.has(path)).toBe(false);
    expect(tags).toContain("article:a1");
    expect(repo.audits()).toEqual([
      expect.objectContaining({ action: "media.takedown", objectRef: "media:m-1" }),
    ]);
  });

  it("exige motivo e asset existente", async () => {
    const { repo, store } = setup({});
    const deps = { repo, store, revalidate: async () => {}, now: () => NOW };
    expect(await takedownReproduction(deps, { mediaId: "m-1" }, "x", " ")).toEqual({
      ok: false,
      error: "reason_required",
    });
    expect(await takedownReproduction(deps, { mediaId: "nada" }, "x", "motivo")).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
