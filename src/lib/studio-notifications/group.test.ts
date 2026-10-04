import { describe, expect, it } from "vitest";
import {
  applyRead,
  badgeText,
  countUnread,
  fromRow,
  groupBySeverity,
  mergeNotifications,
  newSince,
  safeStudioHref,
  sortNotifications,
} from "./group";
import type { StudioNotification } from "./types";

const n = (id: string, over: Partial<StudioNotification> = {}): StudioNotification => ({
  id,
  kind: "approval_pending",
  severity: "info",
  title: `t-${id}`,
  body: "",
  href: "/estudio",
  objectRef: null,
  createdAt: "2026-10-03T12:00:00Z",
  readAt: null,
  ...over,
});

describe("ordenação", () => {
  it("mais recente primeiro, desempate por id", () => {
    const out = sortNotifications([
      n("b", { createdAt: "2026-10-03T10:00:00Z" }),
      n("a", { createdAt: "2026-10-03T10:00:00Z" }),
      n("c", { createdAt: "2026-10-03T11:00:00Z" }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});

describe("agrupamento por severidade", () => {
  it("urgentes, atenção, informativas; pula grupo vazio; não lidas antes", () => {
    const groups = groupBySeverity([
      n("i1", { severity: "info" }),
      n("u-lida", {
        severity: "urgent",
        readAt: "2026-10-03T13:00:00Z",
        createdAt: "2026-10-03T12:30:00Z",
      }),
      n("u-nova", { severity: "urgent", createdAt: "2026-10-03T11:00:00Z" }),
    ]);
    expect(groups.map((g) => g.severity)).toEqual(["urgent", "info"]);
    expect(groups[0]!.items.map((x) => x.id)).toEqual(["u-nova", "u-lida"]);
  });
  it("lista vazia não gera grupos", () => {
    expect(groupBySeverity([])).toEqual([]);
  });
});

describe("dedupe ao juntar listas", () => {
  it("mesma id não repete e a nova vence (estado de leitura)", () => {
    const merged = mergeNotifications(
      [n("a"), n("b")],
      [n("b", { readAt: "2026-10-03T13:00:00Z" }), n("c", { createdAt: "2026-10-03T13:00:00Z" })],
    );
    expect(merged.map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(merged.find((x) => x.id === "b")?.readAt).not.toBeNull();
  });
});

describe("contagem e leitura", () => {
  it("conta não lidas e aplica leitura otimista sem tocar nas já lidas", () => {
    const list = [n("a"), n("b", { readAt: "2026-10-03T09:00:00Z" }), n("c")];
    expect(countUnread(list)).toBe(2);
    const one = applyRead(list, new Set(["a"]), "2026-10-03T14:00:00Z");
    expect(countUnread(one)).toBe(1);
    expect(one.find((x) => x.id === "b")?.readAt).toBe("2026-10-03T09:00:00Z");
    expect(countUnread(applyRead(list, "all", "2026-10-03T14:00:00Z"))).toBe(0);
  });
  it("newSince só conta não lidas desconhecidas", () => {
    expect(newSince(new Set(["a"]), [n("a"), n("b"), n("c", { readAt: "x" })])).toBe(1);
  });
});

describe("contador do sino", () => {
  it.each([
    [0, ""],
    [1, "1"],
    [99, "99"],
    [100, "99+"],
  ])("%i vira %j", (v, t) => expect(badgeText(v)).toBe(t));
});

describe("href seguro", () => {
  it.each([
    ["/estudio", "/estudio"],
    ["/estudio/denuncias?x=1", "/estudio/denuncias?x=1"],
    ["https://evil.test", "/estudio/notificacoes"],
    ["//evil.test", "/estudio/notificacoes"],
    ["/outra", "/estudio/notificacoes"],
    ["/estudio//x", "/estudio/notificacoes"],
  ])("%s", (inp, out) => expect(safeStudioHref(inp)).toBe(out));
  it("fromRow normaliza severidade e href", () => {
    const r = fromRow({
      id: "1",
      kind: "k",
      severity: "estranha",
      title: "t",
      body: "",
      href: "javascript:alert(1)",
      object_ref: null,
      created_at: "2026-10-03T12:00:00Z",
      read_at: null,
    });
    expect(r.severity).toBe("info");
    expect(r.href).toBe("/estudio/notificacoes");
  });
});
