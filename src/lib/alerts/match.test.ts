import { describe, expect, it } from "vitest";
import type { LocalAlert } from "@/lib/anon/types";
import { EMPTY_STATE, dueNotifications, isQuietHour, pollSince, type AlertItem } from "./match";

const created = "2026-09-27T10:00:00Z";
function alert(over: Partial<LocalAlert>): LocalAlert {
  return {
    id: "a1",
    kind: "bairro",
    target: "cpa",
    label: "CPA",
    frequency: "immediate",
    channel: "browser",
    status: "active",
    at: created,
    ...over,
  };
}
function item(id: string, over: Partial<AlertItem> = {}): AlertItem {
  return {
    id,
    kind: "article",
    title: `Matéria ${id}`,
    href: `/materia/${id}`,
    section: "cidade",
    neighborhoods: ["cpa"],
    topicSlug: null,
    urgent: false,
    publishedAt: "2026-09-27T14:00:00Z",
    ...over,
  };
}
// 12h em Cuiabá (UTC-4)
const noon = new Date("2026-09-27T16:00:00Z");

describe("alertas de navegador (P18)", () => {
  it("imediato: uma notificação por item novo que casa com o alvo, sem repetir", () => {
    const r = dueNotifications(
      [alert({})],
      [item("1"), item("2", { neighborhoods: ["porto"] })],
      EMPTY_STATE,
      noon,
    );
    expect(r.notifications.map((n) => n.href)).toEqual(["/materia/1"]);
    const again = dueNotifications([alert({})], [item("1")], r.state, noon);
    expect(again.notifications).toEqual([]);
  });

  it("cada tipo casa com o seu campo; item anterior ao alerta não conta", () => {
    const items = [
      item("t", { neighborhoods: [], section: "politica" }),
      item("s", { neighborhoods: [], topicSlug: "plano-de-onibus" }),
      item("u", { neighborhoods: [], urgent: true }),
      item("e", { neighborhoods: [], kind: "event" }),
      item("old", { publishedAt: "2026-09-26T10:00:00Z" }),
    ];
    const kinds: [LocalAlert["kind"], string, string][] = [
      ["tema", "politica", "t"],
      ["assunto", "plano-de-onibus", "s"],
      ["urgentes", "todos", "u"],
      ["agenda", "todos", "e"],
    ];
    for (const [kind, target, id] of kinds) {
      const r = dueNotifications([alert({ kind, target })], items, EMPTY_STATE, noon);
      expect(
        r.notifications.map((n) => n.href),
        kind,
      ).toEqual([`/materia/${id}`]);
    }
    expect(dueNotifications([alert({})], [items[4]!], EMPTY_STATE, noon).notifications).toEqual([]);
  });

  it("no máximo 3 por dia", () => {
    const items = ["1", "2", "3", "4", "5"].map((id) => item(id));
    const r = dueNotifications([alert({})], items, EMPTY_STATE, noon);
    expect(r.notifications).toHaveLength(3);
    const later = dueNotifications([alert({})], items, r.state, new Date("2026-09-27T20:00:00Z"));
    expect(later.notifications).toHaveLength(0);
    const nextDay = dueNotifications([alert({})], items, r.state, new Date("2026-09-28T13:00:00Z"));
    expect(nextDay.notifications).toHaveLength(2);
  });

  it("silêncio das 22h às 7h (Cuiabá): guarda para depois", () => {
    expect(isQuietHour(new Date("2026-09-28T03:00:00Z"))).toBe(true); // 23h
    expect(isQuietHour(new Date("2026-09-28T10:30:00Z"))).toBe(true); // 6h30
    expect(isQuietHour(new Date("2026-09-28T11:00:00Z"))).toBe(false); // 7h
    const night = dueNotifications(
      [alert({})],
      [item("1")],
      EMPTY_STATE,
      new Date("2026-09-28T03:00:00Z"),
    );
    expect(night.notifications).toEqual([]);
    const morning = dueNotifications(
      [alert({})],
      [item("1")],
      night.state,
      new Date("2026-09-28T11:30:00Z"),
    );
    expect(morning.notifications).toHaveLength(1);
  });

  it("resumo diário: uma notificação com a contagem, no máximo 1 por dia", () => {
    const a = alert({ frequency: "daily" });
    const r = dueNotifications([a], [item("1"), item("2")], EMPTY_STATE, noon);
    expect(r.notifications).toEqual([
      expect.objectContaining({ title: "2 novidades: CPA", href: "/cidade?bairro=cpa" }),
    ]);
    const again = dueNotifications([a], [item("3")], r.state, new Date("2026-09-27T20:00:00Z"));
    expect(again.notifications).toEqual([]);
  });

  it("e-mail e pendentes não viram notificação de navegador", () => {
    const r = dueNotifications(
      [alert({ channel: "email" }), alert({ id: "a2", status: "pending_email" })],
      [item("1")],
      EMPTY_STATE,
      noon,
    );
    expect(r.notifications).toEqual([]);
  });
});

describe("pollSince (gate P2, I7)", () => {
  const now = new Date("2026-09-28T15:37:12.345Z");
  it("arredonda para a janela de 15 min: sem milissegundos nem minuto exato do aparelho", () => {
    const since = pollSince([alert({ at: "2026-09-28T09:41:27.913Z" })], now);
    expect(since).toBe("2026-09-28T09:30:00.000Z");
  });
  it("dois aparelhos com alertas diferentes na mesma janela mandam o mesmo valor", () => {
    const a = pollSince([alert({ at: "2026-09-20T09:41:27.913Z" })], now);
    const b = pollSince([alert({ at: "2026-09-01T22:02:03.004Z" })], now);
    expect(a).toBe(b);
    expect(a).toBe("2026-09-26T15:30:00.000Z");
  });
  it("muda com o relógio, não com o aparelho", () => {
    const later = new Date(now.getTime() + 15 * 60_000);
    expect(pollSince([alert({ at: "2026-09-01T00:00:00Z" })], later)).toBe(
      "2026-09-26T15:45:00.000Z",
    );
  });
});
