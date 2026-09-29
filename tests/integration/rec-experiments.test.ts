// @vitest-environment node
// P5-T7 · Recomendação: pesos com aprovação dupla, testes A/B, campanhas e "por que esta
// recomendação" (plano P5 Task 7; spec §7 e §8). Roda como usuários de seed (RLS valendo).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { approve } from "@/lib/approvals";
import {
  explainForAnon,
  getExperiment,
  getExperimentMetrics,
} from "@/lib/db/queries/recommendation";
import { assignVariant } from "@/lib/ranking";
import {
  createCampaign,
  createExperiment,
  endCampaign,
  endExperiment,
  promoteWinner,
  proposeWeights,
  startExperiment,
} from "@/lib/studio/recommendation";
import { asUser, service } from "./studio";

const WEIGHTS = {
  popularity: 0.3,
  individual: 0.2,
  recency: 0.15,
  engagement: 0.1,
  operational: 0.1,
  diversity: 0.15,
};

const versions: string[] = [];
const experiments: string[] = [];
const campaigns: string[] = [];
const anons: string[] = [];
let originalActive: string | null = null;

afterAll(async () => {
  // Restaura os pesos em vigor e apaga o que a suíte criou (service role passa pelos guards).
  if (versions.length > 0) {
    await service.from("approvals").delete().eq("kind", "rec.weights").in("target_ref", versions);
    if (originalActive) {
      await service.from("rec_weights").update({ active: false }).in("version", versions);
      await service.from("rec_weights").update({ active: true }).eq("version", originalActive);
    }
    await service.from("rec_weights").delete().in("version", versions);
  }
  if (experiments.length) await service.from("rec_experiments").delete().in("id", experiments);
  if (campaigns.length) await service.from("rec_campaigns").delete().in("id", campaigns);
  if (anons.length) await service.from("events").delete().in("anon_id", anons);
});

async function loadActive() {
  const r = await service.from("rec_weights").select("version").eq("active", true).single();
  originalActive = r.data?.version ?? null;
}

const input = (over: Record<string, unknown> = {}) => ({
  weights: WEIGHTS,
  cap: 0.25,
  discoveryEvery: 5,
  justification: "Dar mais peso à diversidade",
  ...over,
});

describe("pesos: proposta e aprovação dupla", () => {
  it("soma diferente de 1 é recusada; quem não tem papel também", async () => {
    await loadActive();
    const bad = await asUser("diego", () =>
      proposeWeights(input({ weights: { ...WEIGHTS, diversity: 0.14 } })),
    );
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const noRole = await asUser("juliana", () => proposeWeights(input()));
    expect(noRole).toMatchObject({ ok: false, error: "forbidden" });
    const same = await asUser("diego", () =>
      proposeWeights(
        input({
          weights: {
            popularity: 0.35,
            individual: 0.25,
            recency: 0.15,
            engagement: 0.1,
            operational: 0.1,
            diversity: 0.05,
          },
        }),
      ),
    );
    expect(same).toMatchObject({ ok: false, error: "invalid" });
  });

  it("propor cria versão inativa com pedido; quem propôs não aprova; só admin aprova", async () => {
    const r = await asUser("diego", () => proposeWeights(input()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const version = r.value.version;
    versions.push(version);
    expect(version).toMatch(/^rec-v1\.\d+$/);
    const row = await service.from("rec_weights").select("*").eq("version", version).single();
    expect(row.data).toMatchObject({ active: false, approved_by: null });
    const ap = await service
      .from("approvals")
      .select("id, status")
      .eq("kind", "rec.weights")
      .eq("target_ref", version)
      .single();
    expect(ap.data?.status).toBe("pending");
    const id = ap.data!.id;

    expect(await asUser("diego", () => approve({ id }))).toMatchObject({
      ok: false,
      error: "self_approval",
    });
    expect((await asUser("marina", () => approve({ id }))).ok).toBe(false); // editor_chefe não decide pesos
    const still = await service
      .from("rec_weights")
      .select("active")
      .eq("version", version)
      .single();
    expect(still.data?.active).toBe(false);

    expect((await asUser("helena", () => approve({ id }))).ok).toBe(true);
    const now = await service
      .from("rec_weights")
      .select("active, approved_by")
      .eq("version", version)
      .single();
    expect(now.data?.active).toBe(true);
    expect(now.data?.approved_by).not.toBeNull();
  });
});

describe("testes A/B", () => {
  it("cria, inicia, mede por variante e encerra; a divisão inválida é recusada", async () => {
    const other = `rec-v1.${900 + (Date.now() % 90)}`;
    await service.from("rec_weights").insert({
      version: other,
      weights: WEIGHTS,
      cap: 0.25,
      discovery_every: 5,
      proposed_by: "c1000000-0000-4000-8000-000000000007",
    });
    versions.push(other);

    // Gate P5 (B5): variante só com pesos aprovados por outra pessoa.
    const unapproved = await asUser("diego", () =>
      createExperiment({
        name: "Pesos sem aprovação",
        variants: [
          { label: "A", weightsVersion: "rec-v1" },
          { label: "B", weightsVersion: other },
        ],
        split: [0.5, 0.5],
      }),
    );
    expect(unapproved).toMatchObject({ ok: false, error: "invalid" });
    await service
      .from("rec_weights")
      .update({ approved_by: "c1000000-0000-4000-8000-000000000001" })
      .eq("version", other);

    const badSplit = await asUser("diego", () =>
      createExperiment({
        name: "Teste inválido",
        variants: [
          { label: "A", weightsVersion: "rec-v1" },
          { label: "B", weightsVersion: other },
        ],
        split: [0.5, 0.4],
      }),
    );
    expect(badSplit).toMatchObject({ ok: false, error: "invalid" });
    const unknownVersion = await asUser("diego", () =>
      createExperiment({
        name: "Versão inexistente",
        variants: [
          { label: "A", weightsVersion: "rec-v1" },
          { label: "B", weightsVersion: "nao-existe" },
        ],
        split: [0.5, 0.5],
      }),
    );
    expect(unknownVersion).toMatchObject({ ok: false, error: "invalid" });

    const created = await asUser("diego", () =>
      createExperiment({
        name: "Mais diversidade",
        variants: [
          { label: "Controle", weightsVersion: "rec-v1" },
          { label: "B", weightsVersion: other },
        ],
        split: [0.5, 0.5],
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.id;
    experiments.push(id);
    expect((await asUser("juliana", () => startExperiment({ id }))).ok).toBe(false);
    expect((await asUser("diego", () => startExperiment({ id }))).ok).toBe(true);
    expect(await asUser("diego", () => startExperiment({ id }))).toMatchObject({
      ok: false,
      error: "conflict",
    });

    // Variantes e divisão não mudam depois de iniciar (trigger).
    const tamper = await service
      .from("rec_experiments")
      .update({ split: [0.9, 0.1] })
      .eq("id", id);
    expect(tamper.error).not.toBeNull();

    // Eventos de leitores com Personalização, depois do início.
    const exp = await service.from("rec_experiments").select("split").eq("id", id).single();
    const split = (exp.data?.split as number[]).map(Number);
    const rows = [];
    for (let i = 0; i < 40; i++) {
      const anon = randomUUID();
      anons.push(anon);
      const v = assignVariant(anon, { id, split });
      const base = {
        anon_id: anon,
        at: new Date().toISOString(),
        source_slug: "folha-do-cerrado",
        session: { id: "s", page: "/fontes", referrer: null, device: "desktop" },
        consent: { version: "1", metrics: true, personalization: true },
        algo_version: "rec-v1",
      };
      rows.push({ ...base, name: "source_viewed", props: { surface: "fontes" } });
      if (v === 1)
        rows.push({
          ...base,
          name: "recommendation_clicked",
          props: { list: "recommended", reason: "trending", position: 1 },
        });
    }
    const ins = await service.from("events").insert(rows);
    expect(ins.error).toBeNull();

    const m = await asUser("diego", async () => {
      const e = await getExperiment(id);
      return e ? getExperimentMetrics(e) : null;
    });
    expect(m?.hasData).toBe(true);
    const [a, b] = m!.metrics;
    expect(a!.readers + b!.readers).toBe(40);
    expect(a!.ctr).toBe(0);
    expect(b!.ctr).toBe(1);
    expect(b!.diversity).toBe(0);

    expect(await asUser("diego", () => endExperiment({ id, winner: 5 }))).toMatchObject({
      ok: false,
    });
    expect((await asUser("diego", () => endExperiment({ id, winner: 1 }))).ok).toBe(true);
    const done = await service
      .from("rec_experiments")
      .select("status, winner")
      .eq("id", id)
      .single();
    expect(done.data).toEqual({ status: "ended", winner: 1 });

    // Promover pede aprovação para a versão vencedora; nada muda em vigor.
    const before = await service.from("rec_weights").select("version").eq("active", true).single();
    const promoted = await asUser("diego", () =>
      promoteWinner({ id, justification: "Diversidade subiu sem perder CTR" }),
    );
    expect(promoted.ok).toBe(true);
    const copy = promoted.ok ? promoted.value.version : "";
    expect(copy).toMatch(/^rec-v1\.\d+$/);
    expect(copy).not.toBe(other);
    versions.push(copy);
    const after = await service.from("rec_weights").select("version").eq("active", true).single();
    expect(after.data?.version).toBe(before.data?.version);
    const ap = await service
      .from("approvals")
      .select("status")
      .eq("kind", "rec.weights")
      .eq("target_ref", copy);
    expect(ap.data?.map((x) => x.status)).toEqual(["pending"]);
  });
});

describe("campanhas de descoberta", () => {
  it("cria com fontes reais, recusa fonte desconhecida e encerra", async () => {
    const src = await service
      .from("sources")
      .select("slug")
      .eq("status", "active")
      .limit(1)
      .single();
    const slug = src.data!.slug!;
    const day = new Date().toISOString().slice(0, 10);
    const bad = await asUser("diego", () =>
      createCampaign({
        name: "Sem fonte",
        sourceSlugs: ["fonte-que-nao-existe"],
        startsOn: day,
        endsOn: day,
        quotaPct: 10,
        audience: "todos",
      }),
    );
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    const long = await asUser("diego", () =>
      createCampaign({
        name: "Longa",
        sourceSlugs: [slug],
        startsOn: day,
        endsOn: "2099-01-01",
        quotaPct: 10,
        audience: "todos",
      }),
    );
    expect(long).toMatchObject({ ok: false, error: "invalid" });
    const ok = await asUser("diego", () =>
      createCampaign({
        name: "Descoberta de teste",
        sourceSlugs: [slug],
        startsOn: day,
        endsOn: day,
        quotaPct: 10,
        audience: "anonimos",
      }),
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    campaigns.push(ok.value.id);
    expect((await asUser("juliana", () => endCampaign({ id: ok.value.id }))).ok).toBe(false);
    expect((await asUser("diego", () => endCampaign({ id: ok.value.id }))).ok).toBe(true);
  });
});

describe("por que esta recomendação", () => {
  it("sem Personalização o peso individual é 0; com ela, entra no score", async () => {
    const off = randomUUID();
    const on = randomUUID();
    anons.push(off, on);
    const base = {
      at: new Date().toISOString(),
      name: "source_viewed",
      source_slug: "folha-do-cerrado",
      session: { id: "s", page: "/fontes", referrer: null, device: "desktop" },
      algo_version: "rec-v1",
      props: { surface: "fontes" },
    };
    await service.from("events").insert([
      { ...base, anon_id: off, consent: { version: "1", metrics: true, personalization: false } },
      { ...base, anon_id: on, consent: { version: "1", metrics: true, personalization: true } },
    ]);
    const a = await asUser("diego", () => explainForAnon(off));
    const b = await asUser("diego", () => explainForAnon(on));
    expect(a.personalization).toBe(false);
    // M1-R3: o servidor não guarda o consentimento vigente (retirar não deixa rastro ligado ao id;
    // os eventos novos vêm sem `anon_id`), então o último evento com consentimento antigo não vale.
    expect(b.personalization).toBe(false);
    expect(a.alias).toMatch(/^leitor-[0-9a-f]{8}$/);
    expect(JSON.stringify(a)).not.toContain(off);
    for (const r of a.rows) {
      const ind = r.components.find((c) => c.key === "individual")!;
      expect(ind.weight).toBe(0);
      expect(ind.value).toBe(0);
    }
    for (const r of b.rows) {
      const ind = r.components.find((c) => c.key === "individual")!;
      expect(ind.weight).toBe(0);
      expect(ind.value).toBe(0);
    }
    // Leitor que retirou a Personalização: evento antigo com consentimento e nenhum evento novo
    // com o id (vêm com `anon_id` nulo). Não pode mostrar afinidade individual.
    const withdrawn = randomUUID();
    anons.push(withdrawn);
    await service.from("events").insert([
      {
        ...base,
        at: new Date(Date.now() - 3_600_000).toISOString(),
        anon_id: withdrawn,
        consent: { version: "1", metrics: true, personalization: true },
      },
      { ...base, anon_id: null, consent: { version: "1", metrics: true, personalization: false } },
    ]);
    const w = await asUser("diego", () => explainForAnon(withdrawn));
    expect(w.personalization).toBe(false);
    for (const r of w.rows) expect(r.components.find((c) => c.key === "individual")!.value).toBe(0);
    const unknown = await asUser("diego", () => explainForAnon(randomUUID()));
    expect(unknown.personalization).toBe(false);
  });
});
