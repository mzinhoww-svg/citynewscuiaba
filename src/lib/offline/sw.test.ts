// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  askSw,
  clearOffline,
  queryCachedAt,
  registerSwOnIdle,
  sendConsentToSw,
  swAllowedOn,
} from "./sw";

function fakeController(reply?: unknown) {
  const posted: { msg: unknown; ports: MessagePort[] }[] = [];
  const controller = {
    postMessage: (msg: unknown, ports: MessagePort[] = []) => {
      posted.push({ msg, ports });
      if (reply !== undefined && ports[0]) ports[0].postMessage(reply);
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    value: { controller, register: vi.fn(), ready: Promise.resolve({ active: controller }) },
    configurable: true,
  });
  return posted;
}

afterEach(() => {
  Object.defineProperty(navigator, "serviceWorker", { value: undefined, configurable: true });
});

describe("registro", () => {
  it("não registra em /estudio; registra depois do load em página pública", () => {
    expect(swAllowedOn("/estudio")).toBe(false);
    expect(swAllowedOn("/estudio/fila")).toBe(false);
    expect(swAllowedOn("/")).toBe(true);
    expect(swAllowedOn("/materia/x")).toBe(true);
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register, ready: Promise.resolve({}) },
      configurable: true,
    });
    const idle = vi.fn((cb: () => void) => cb());
    expect(registerSwOnIdle("/estudio/fila", { idle })).toBe(false);
    expect(idle).not.toHaveBeenCalled();
    expect(registerSwOnIdle("/cidade", { idle })).toBe(true);
    expect(idle).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });
});

describe("mensagens", () => {
  it("askSw responde pelo MessageChannel e devolve null sem SW ou sem resposta", async () => {
    const posted = fakeController({ cachedAt: "2026-09-28T18:32:00Z" });
    expect(await queryCachedAt("/materia/x")).toBe("2026-09-28T18:32:00Z");
    expect(posted[0]!.msg).toEqual({ type: "served-from-cache", url: "/materia/x" });
    fakeController();
    expect(await askSw({ type: "list-offline" }, 30)).toBeNull();
    Object.defineProperty(navigator, "serviceWorker", {
      value: { controller: null },
      configurable: true,
    });
    expect(await clearOffline()).toBe(false);
  });

  it("clear-offline e consent com aparelho e navegador", async () => {
    const posted = fakeController({ cleared: true });
    expect(await clearOffline()).toBe(true);
    await sendConsentToSw({ metrics: true });
    expect(posted.at(-1)!.msg).toEqual({
      type: "consent",
      metrics: true,
      device: expect.stringMatching(/mobile|tablet|desktop/),
      browser: expect.any(String),
    });
  });
});
