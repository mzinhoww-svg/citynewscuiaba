import { expiringLicenses, illustrationGuard, type LicensedAsset } from "./licenses";

const TODAY = "2026-09-28";
const asset = (over: Partial<LicensedAsset>): LicensedAsset => ({
  id: "m1",
  license: "Banco Cerrado Imagens · contrato 14",
  licenseUntil: null,
  status: "approved",
  publishedArticles: [],
  ...over,
});

it("licença vencendo em 20 dias aparece", () => {
  const r = expiringLicenses([asset({ id: "a", licenseUntil: "2026-10-18" })], TODAY);
  expect(r.expiring).toEqual([expect.objectContaining({ id: "a", daysLeft: 20 })]);
  expect(r.expired).toEqual([]);
  expect(r.alerts).toEqual([]);
});

it("fora da janela, sem data ou bloqueada não entram", () => {
  const r = expiringLicenses(
    [
      asset({ id: "longe", licenseUntil: "2026-12-31" }),
      asset({ id: "sem", licenseUntil: null }),
      asset({ id: "bloq", licenseUntil: "2026-09-01", status: "blocked" }),
    ],
    TODAY,
  );
  expect(r).toEqual({ expiring: [], expired: [], alerts: [] });
  expect(
    expiringLicenses([asset({ id: "x", licenseUntil: "2026-10-10" })], TODAY, 10).expiring,
  ).toEqual([]);
});

it("vence hoje ainda vale; ontem já venceu", () => {
  const r = expiringLicenses(
    [
      asset({ id: "hoje", licenseUntil: TODAY }),
      asset({ id: "ontem", licenseUntil: "2026-09-27" }),
    ],
    TODAY,
  );
  expect(r.expiring.map((e) => e.id)).toEqual(["hoje"]);
  expect(r.expired.map((e) => e.id)).toEqual(["ontem"]);
});

it("vencida em matéria publicada gera alerta com troca sugerida", () => {
  const r = expiringLicenses(
    [
      asset({
        id: "venc",
        licenseUntil: "2026-09-20",
        publishedArticles: [{ id: "art1", title: "Feira do agro" }],
      }),
    ],
    TODAY,
  );
  expect(r.expired).toEqual([expect.objectContaining({ id: "venc", daysLeft: -8 })]);
  expect(r.alerts).toEqual([
    {
      mediaId: "venc",
      articleId: "art1",
      message: 'Licença vencida em matéria publicada: "Feira do agro". Troque a imagem.',
    },
  ]);
});

it("gerar ilustração para categoria seguranca é recusado", () => {
  expect(illustrationGuard({ category: "seguranca", sensitive: false, tags: [] })).toEqual({
    ok: false,
    error: "Ilustração gerada não é permitida para Segurança, crime, tragédia ou saúde individual.",
  });
  expect(illustrationGuard({ category: "cidade", sensitive: true, tags: [] }).ok).toBe(false);
  expect(illustrationGuard({ category: "cidade", sensitive: false, tags: ["acidente"] }).ok).toBe(
    false,
  );
  expect(illustrationGuard({ category: "cultura", sensitive: false, tags: ["teatro"] })).toEqual({
    ok: true,
    value: {
      restrictions: [
        "Não fotorrealista",
        "Sem pessoas reais identificáveis",
        "Sem crime, tragédia ou saúde individual",
        "Rótulo IMAGEM GERADA POR IA",
      ],
    },
  });
});
