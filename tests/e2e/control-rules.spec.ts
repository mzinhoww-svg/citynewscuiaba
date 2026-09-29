import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Json } from "@/lib/db/types";
import { loginAs, service, STAFF, tag } from "./studio";

/*
 * Regras de autonomia (P5-T2; Review Focus 5 e 1): Diego (operador de IA) desliga a revisão
 * obrigatória, simula com os últimos 7 dias e vê quantos itens mudariam de destino antes de
 * propor; propõe com justificativa; não consegue aprovar o próprio pedido ("A aprovação precisa
 * ser de outra pessoa"); Marina (chefia de redação) aprova e a versão entra em vigor.
 *
 * Só uma versão de regras fica ativa por vez: o fluxo roda no projeto desktop (o mobile rodaria
 * a mesma troca em paralelo e disputaria a versão ativa). A tela no celular é coberta pelo a11y.
 */
const KINDS = ["rules.activate", "safety.disable", "force_review.disable"];
const t = tag();
let activeBefore: number[] = [];
let created: number | null = null;

test.beforeAll(async () => {
  const db = service();
  activeBefore = ((await db.from("rules").select("version").eq("active", true)).data ?? []).map(
    (r) => r.version,
  );
  const candidate = {
    category: "servicos",
    tags: [],
    independentSources: 2,
    primarySources: 0,
    centralConflict: false,
    imageApproved: false,
    confidenceScore: 0.7,
    breaking: false,
  };
  const { error } = await db.from("decisions").insert(
    [0, 1, 2].map((i) => ({
      object_ref: `article:e2e-regras-${t}-${i}-${randomUUID()}`,
      step: "rules",
      rules_version: 1,
      input_hash: `e2e-regras-${t}-${i}`,
      output: { route: "review", rule: "force_review", candidate } as unknown as Json,
      rationale: "e2e de regras",
      recommended: "review",
    })),
  );
  if (error) throw error;
});

test.afterAll(async () => {
  const db = service();
  await db.from("decisions").delete().like("input_hash", `e2e-regras-${t}-%`);
  // Só a versão criada neste worker (o outro projeto pode estar no meio do próprio teste).
  if (created === null) return;
  await db.from("approvals").delete().in("kind", KINDS).eq("target_ref", String(created));
  await db.from("rules").update({ active: false }).eq("version", created);
  if (activeBefore.length > 0)
    await db.from("rules").update({ active: true }).in("version", activeBefore);
  await db.from("rules").delete().eq("version", created);
});

test("Diego simula e propõe; não aprova a própria proposta; Marina aprova e a versão entra em vigor", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Uma versão ativa por vez: fluxo só no desktop.");
  const why = `Autonomia para Serviços ${t}`;

  await loginAs(page, "diego", "/estudio/control/regras");
  await expect(page.getByRole("heading", { name: "Versão em vigor" })).toBeVisible();
  const propose = page.getByRole("button", { name: "Propor nova versão" });
  await expect(propose).toBeDisabled();

  await page.getByRole("checkbox", { name: "Revisão obrigatória (forceReview)" }).uncheck();
  await expect(page.getByText("desliga a revisão obrigatória", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Simular com os últimos 7 dias" }).click();
  const summary = page.getByText(/\d+ de \d+ ite(m|ns) dos últimos 7 dias mudaria/);
  await expect(summary).toBeVisible();
  const [, changed] = /(\d+) de/.exec((await summary.textContent()) ?? "") ?? [];
  expect(Number(changed)).toBeGreaterThanOrEqual(3);
  const moves = page.getByRole("region", { name: "Mudanças de destino na simulação" });
  await expect(moves.getByRole("row", { name: /Revisão humana Publicar/ })).toBeVisible();

  await page.getByLabel("Justificativa").fill(why);
  await propose.click();
  await expect(page).toHaveURL(/ok=proposta&versao=\d+/);
  const version = Number(/versao=(\d+)/.exec(page.url())?.[1]);
  created = version;
  await expect(
    page.getByRole("status").filter({ hasText: `Versão ${version} proposta` }),
  ).toBeVisible();
  const row = await service().from("rules").select("*").eq("version", version).single();
  expect(row.data).toMatchObject({
    proposed_by: STAFF.diego.id,
    active: false,
    force_review: false,
  });

  // Diego vê o próprio pedido sem ação de aprovar, com o aviso.
  await page.goto("/estudio/control/aprovacoes");
  const own = page.getByRole("article").filter({ hasText: why });
  await expect(
    own.getByText("A aprovação precisa ser de outra pessoa", { exact: false }),
  ).toBeVisible();
  await expect(own.getByRole("button", { name: /Aprovar/ })).toHaveCount(0);

  await page.context().clearCookies();
  await loginAs(page, "marina", "/estudio/control/aprovacoes");
  await page
    .getByRole("article")
    .filter({ hasText: why })
    .getByRole("button", { name: /^Aprovar:/ })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "Aprovação registrada." })).toBeVisible();

  await page.goto("/estudio/control/regras");
  await expect(
    page.getByText(`Versão ${version}, aprovada por Marina Arruda`, { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Revisão obrigatória desligada", { exact: false })).toBeVisible();
  const active = await service().from("rules").select("version").eq("active", true);
  expect((active.data ?? []).map((r) => r.version)).toEqual([version]);
});

test("sem papel para propor regras, a tela não abre", async ({ page }) => {
  await loginAs(page, "juliana");
  await page.goto("/estudio/control/regras");
  await expect(page).toHaveURL(/motivo=sem-permissao/);
});
