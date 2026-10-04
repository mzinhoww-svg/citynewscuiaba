import { describe, expect, it } from "vitest";
import { buildReport, reportCsv, reportPeriod, slotOccupancy, type ReportRow } from "./report";

const row = (over: Partial<ReportRow>): ReportRow => ({
  day: "2026-10-04",
  placementId: "p1",
  slot: "TOP",
  advertiser: "Padaria do Porto",
  creative: "Topo",
  section: "cidade",
  impressions: 0,
  views: 0,
  clicks: 0,
  ...over,
});

describe("relatório de anúncios (ADS-T4)", () => {
  const rows = [
    row({ impressions: 100, views: 60, clicks: 3 }),
    row({ section: "", impressions: 100, views: 40, clicks: 1 }),
    row({ day: "2026-10-05", slot: "MID", impressions: 50, views: 20, clicks: 0 }),
    row({ advertiser: null, slot: "MID", impressions: 10, views: 5, clicks: 1 }),
  ];

  it("soma por campo, dia e anunciante, com CTR e taxa de visualização", () => {
    const r = buildReport(rows);
    expect(r.total).toEqual({
      impressions: 260,
      views: 125,
      clicks: 5,
      ctr: 5 / 260,
      viewRate: 125 / 260,
    });
    expect(r.bySlot.map((s) => [s.key, s.impressions, s.clicks])).toEqual([
      ["TOP", 200, 4],
      ["MID", 60, 1],
    ]);
    expect(r.byDay.map((d) => d.key)).toEqual(["2026-10-04", "2026-10-05"]);
    expect(r.byAdvertiser.map((a) => a.key)).toEqual(["Padaria do Porto", "CityNews (casa)"]);
    expect(r.bySection.find((s) => s.key === "home")?.impressions).toBe(100);
  });

  it("sem impressão, CTR é zero (nunca divide por zero)", () => {
    expect(buildReport([]).total.ctr).toBe(0);
  });

  it("CSV com cabeçalho em pt-BR, vírgula decimal e sem fórmula injetável", () => {
    const csv = reportCsv([
      row({ advertiser: "=HYPERLINK(1)", impressions: 3, clicks: 1, views: 2 }),
    ]);
    const [head, line] = csv.trim().split("\n");
    expect(head).toBe("dia;campo;anunciante;peça;editoria;impressões;visualizações;cliques;ctr");
    expect(line).toBe("2026-10-04;TOP;'=HYPERLINK(1);Topo;cidade;3;2;1;33,33%");
  });
});

describe("ocupação dos campos (ADS-T4)", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const p = (slot: string, isHouse: boolean, endsOn = "2026-12-31") => ({
    slot,
    isHouse,
    status: "active",
    startsOn: "2026-10-01",
    endsOn,
  });

  it("cheio (peça paga), casa (só peça da casa) ou vazio; fim em até 3 dias vira alerta", () => {
    const occ = slotOccupancy(
      [p("TOP", false), p("TOP", true), p("MID", true), p("ART-1", false, "2026-10-06")],
      now,
    );
    const by = Object.fromEntries(occ.map((o) => [o.slot, o]));
    expect(by.TOP).toMatchObject({ state: "paid", paid: 1, house: 1 });
    expect(by.MID).toMatchObject({ state: "house", paid: 0, house: 1 });
    expect(by["RAIL-B"]).toMatchObject({ state: "empty" });
    expect(by["ART-1"]?.endingSoon).toBe(1);
  });
});

describe("período do relatório (ADS-T4)", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  it("padrão: últimos 7 dias até hoje (dia de Cuiabá)", () => {
    expect(reportPeriod({}, now)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });
  it("aceita datas válidas, inverte se vierem trocadas e limita a 92 dias", () => {
    expect(reportPeriod({ from: "2026-10-01", to: "2026-10-03" }, now)).toEqual({
      from: "2026-10-01",
      to: "2026-10-03",
    });
    expect(reportPeriod({ from: "2026-10-03", to: "2026-10-01" }, now)).toEqual({
      from: "2026-10-01",
      to: "2026-10-03",
    });
    expect(reportPeriod({ from: "2025-01-01", to: "2026-10-04" }, now).from).toBe("2026-07-05");
    expect(reportPeriod({ from: "lixo", to: "2026-13-40" }, now)).toEqual({
      from: "2026-09-28",
      to: "2026-10-04",
    });
  });
});
