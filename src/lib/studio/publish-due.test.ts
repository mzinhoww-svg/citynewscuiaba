import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * B3-R1 (gate P5): a rota do tick chama `publishDueScheduled`; em modo leitura ela não publica
 * agendadas vencidas (nem chama a função do banco).
 */
const rpc = vi.fn(async () => ({ data: [{ id: "a" }], error: null }));
const flag = vi.fn<(key: string, opts?: unknown) => Promise<boolean>>();
vi.mock("@/lib/db/client", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("@/lib/flags", () => ({ getFlag: (k: string, o?: unknown) => flag(k, o) }));

import { publishDueScheduled } from "./publish";

beforeEach(() => {
  rpc.mockClear();
  flag.mockClear();
});

describe("publishDueScheduled e o modo leitura", () => {
  it("com read_only ligado não publica nada", async () => {
    flag.mockResolvedValue(true);
    expect(await publishDueScheduled(async () => undefined)).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
    expect(flag).toHaveBeenCalledWith("read_only", { fresh: true });
  });

  it("com read_only desligado publica as vencidas", async () => {
    flag.mockResolvedValue(false);
    rpc.mockResolvedValueOnce({ data: [{ id: "a" }], error: null });
    expect(await publishDueScheduled(async () => undefined)).toBe(1);
    expect(rpc).toHaveBeenCalledWith("publish_due_scheduled");
  });
});
