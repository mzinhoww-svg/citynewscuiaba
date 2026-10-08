// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.fn();
const last = vi.fn();
vi.mock("@/lib/db/client", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/db/source-logo-run", () => ({
  runSourceLogoSync: (...a: unknown[]) => run(...a),
  lastLogoCheckAt: (...a: unknown[]) => last(...a),
}));

import { POST } from "./route";

const call = (qs = "", auth: string | null = "Bearer segredo-de-teste-da-rota-logos-32+") =>
  POST(
    new Request(`http://x/api/ingest/source-logos${qs}`, {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    }),
  );

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "segredo-de-teste-da-rota-logos-32+");
  run.mockReset().mockResolvedValue({ processed: [], pending: 0 });
  last.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/ingest/source-logos", () => {
  it("recusa sem o segredo do cron e não toca no banco", async () => {
    expect((await call("", null)).status).toBe(401);
    expect((await call("", "Bearer errado")).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("recusa tudo quando o segredo não está configurado", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("", "Bearer ")).status).toBe(401);
  });

  it("poucas fontes por chamada: limite padrão 3, teto 8", async () => {
    await call();
    expect(run.mock.calls[0]?.[0]).toMatchObject({ limit: 3, dry: false });
    await call("?limit=50");
    expect(run.mock.calls[1]?.[0]).toMatchObject({ limit: 8 });
    await call("?limit=abc");
    expect(run.mock.calls[2]?.[0]).toMatchObject({ limit: 3 });
  });

  it("intervalo mínimo: chamada recente é pulada, force ignora", async () => {
    last.mockResolvedValue(new Date(Date.now() - 5 * 60_000));
    const skipped = await call();
    expect(await skipped.json()).toMatchObject({ status: "skipped", reason: "recent" });
    expect(run).not.toHaveBeenCalled();
    const forced = await call("?force=1");
    expect((await forced.json()).status).toBe("done");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("skip só vale no ensaio", async () => {
    await call("?dry=1&skip=6");
    expect(run.mock.calls.at(-1)?.[0]).toMatchObject({ dry: true, skip: 6 });
    await call("?force=1&skip=6");
    expect(run.mock.calls.at(-1)?.[0].skip).toBeUndefined();
  });

  it("chamada antiga passa; ?id inválido é 400; ?id válido trata uma fonte", async () => {
    last.mockResolvedValue(new Date(Date.now() - 60 * 60_000));
    expect((await call()).status).toBe(200);
    expect((await call("?id=nao-e-uuid")).status).toBe(400);
    await call("?id=0b7e3c1e-5a52-4a4c-9c3e-3f6f1f5b8a10&dry=1");
    expect(run.mock.calls.at(-1)?.[0]).toMatchObject({
      sourceId: "0b7e3c1e-5a52-4a4c-9c3e-3f6f1f5b8a10",
      dry: true,
    });
  });
});
