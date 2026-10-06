import { act as rtlAct, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const profile = { saved: [], follows: [], history: [], searches: [], interests: [], alerts: [] };
const store = { degraded: false, get: vi.fn(async () => profile) };
vi.mock("./store", () => ({ getAnonStore: () => store }));
vi.mock("@/lib/consent/client", () => ({
  useConsent: () => [{ personalization: false, decided: true }, vi.fn()],
}));

import { useAnonProfile } from "./use-profile";

describe("useAnonProfile · act", () => {
  it("devolve ok com o valor e relê o perfil", async () => {
    const { result } = renderHook(() => useAnonProfile());
    await waitFor(() => expect(result.current.ready).toBe(true));
    store.get.mockClear();
    let r: unknown;
    await rtlAct(async () => {
      r = await result.current.act(async () => 7);
    });
    expect(r).toEqual({ ok: true, value: 7 });
    expect(store.get).toHaveBeenCalled();
  });

  it("falha do armazenamento vira Result de erro, sem rejeitar, e ainda relê", async () => {
    const { result } = renderHook(() => useAnonProfile());
    await waitFor(() => expect(result.current.ready).toBe(true));
    store.get.mockClear();
    let r: unknown;
    await rtlAct(async () => {
      r = await result.current.act(async () => {
        throw new Error("QuotaExceededError");
      });
    });
    expect(r).toEqual({ ok: false, error: "storage" });
    expect(store.get).toHaveBeenCalled();
  });
});
