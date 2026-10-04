import { createFlagsService, type FlagRow, type FlagsPort } from "./index";

function memoryPort(initial: Partial<Record<FlagRow["key"], boolean>> = {}) {
  const rows = new Map<string, FlagRow>();
  for (const [key, enabled] of Object.entries({
    auto_publish: false,
    read_only: false,
    ai_enabled: true,
    ...initial,
  }))
    rows.set(key, {
      key: key as FlagRow["key"],
      enabled,
      updatedBy: null,
      updatedAt: "2026-09-27",
    });
  const writes: [string, boolean, string][] = [];
  const port: FlagsPort = {
    async read(key) {
      return rows.get(key) ?? null;
    },
    async readAll() {
      return [...rows.values()];
    },
    async write(key, value, actor) {
      writes.push([key, value, actor]);
      rows.set(key, { ...rows.get(key)!, enabled: value, updatedBy: actor });
      return { ok: true, value: undefined };
    },
  };
  return { port, rows, writes };
}

describe("flags de contingência", () => {
  it("lê com falha fechada: ausente ou erro = desligada", async () => {
    const m = memoryPort();
    const f = createFlagsService(m.port);
    expect(await f.getFlag("ai_enabled")).toBe(true);
    expect(await f.getFlag("personalization_enabled")).toBe(false);
    const broken = createFlagsService({
      ...m.port,
      read: async () => {
        throw new Error("banco fora");
      },
    });
    expect(await broken.getFlag("ai_enabled")).toBe(false);
  });

  it("pausar publicação automática grava em nome de quem pediu; repetir não grava", async () => {
    const m = memoryPort({ auto_publish: true });
    const f = createFlagsService(m.port);
    expect(await f.setFlag("auto_publish", false, "helena")).toEqual({
      ok: true,
      value: { changed: true },
    });
    expect(m.writes).toEqual([["auto_publish", false, "helena"]]);
    expect(await f.setFlag("auto_publish", false, "helena")).toEqual({
      ok: true,
      value: { changed: false },
    });
    expect(m.writes).toHaveLength(1);
  });

  it("religar a publicação automática é ação direta do admin (sem segunda pessoa)", async () => {
    const m = memoryPort();
    const f = createFlagsService(m.port);
    expect(await f.setFlag("auto_publish", true, "helena")).toEqual({
      ok: true,
      value: { changed: true },
    });
    expect(m.writes).toHaveLength(1);
  });

  it("flag inexistente é not_found", async () => {
    const f = createFlagsService(memoryPort().port);
    expect(await f.setFlag("source_link_analysis", true, "helena")).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
