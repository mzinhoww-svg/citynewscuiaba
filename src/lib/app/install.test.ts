// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureInstallPrompt,
  handleFirstStandaloneOpen,
  installPromptAvailable,
  isIosSafari,
  platformForInvite,
  promptInstall,
  resetInstallPromptForTests,
} from "./install";
import { parseAppState, readAppState, writeAppState } from "./storage";
import { EMPTY_APP_STATE, markStepsShown } from "./invites";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CRIOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

afterEach(() => {
  resetInstallPromptForTests();
  localStorage.clear();
});

describe("plataforma", () => {
  it("iPhone no Safari, Chrome iOS, Android e desktop", () => {
    expect(isIosSafari(IOS_SAFARI, 5)).toBe(true);
    expect(isIosSafari(CRIOS, 5)).toBe(false);
    expect(platformForInvite(IOS_SAFARI, 5)).toBe("ios");
    expect(platformForInvite(CRIOS, 5)).toBe("ios");
    expect(platformForInvite(ANDROID, 5)).toBe("android");
    expect(platformForInvite(MAC, 0)).toBe("desktop");
    // iPadOS em modo desktop: Macintosh com toque.
    expect(platformForInvite(MAC, 5)).toBe("ios");
  });
});

describe("beforeinstallprompt", () => {
  it("captura com preventDefault e prompt() só no gesto", async () => {
    captureInstallPrompt();
    expect(installPromptAvailable()).toBe(false);
    expect(await promptInstall()).toBe("unavailable");
    const ev = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt?: () => Promise<void>;
      userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
    };
    ev.prompt = vi.fn().mockResolvedValue(undefined);
    ev.userChoice = Promise.resolve({ outcome: "accepted" as const });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(installPromptAvailable()).toBe(true);
    expect(await promptInstall()).toBe("accepted");
    expect(ev.prompt).toHaveBeenCalled();
    expect(installPromptAvailable()).toBe(false);
  });
});

describe("estado", () => {
  it("parseAppState tolera lixo e normaliza", () => {
    expect(parseAppState(null)).toEqual(EMPTY_APP_STATE);
    expect(parseAppState("{lixo")).toEqual(EMPTY_APP_STATE);
    expect(
      parseAppState(
        JSON.stringify({
          visits: -3,
          reads: "x",
          install: { refusals: 2.7, silencedUntil: "lixo", installed: "sim" },
        }),
      ),
    ).toEqual({
      ...EMPTY_APP_STATE,
      install: { refusals: 2, silencedUntil: null, installed: false },
    });
    writeAppState({ ...EMPTY_APP_STATE, visits: 4 });
    expect(readAppState()?.visits).toBe(4);
  });

  it("primeira abertura em standalone com ?origem=app marca instalado, registra e limpa a URL", () => {
    window.history.replaceState(null, "", "/?origem=app&x=1#ultimas");
    Object.defineProperty(window, "matchMedia", {
      value: () => ({ matches: true }),
      configurable: true,
    });
    writeAppState(markStepsShown(EMPTY_APP_STATE));
    const track = vi.fn();
    expect(handleFirstStandaloneOpen(track)).toBe("ios_steps");
    expect(track).toHaveBeenCalledWith("ios_steps");
    expect(location.search).toBe("?x=1");
    expect(location.hash).toBe("#ultimas");
    expect(readAppState()?.install.installed).toBe(true);
    // Já instalado: não registra de novo.
    window.history.replaceState(null, "", "/?origem=app");
    expect(handleFirstStandaloneOpen(track)).toBeNull();
    expect(track).toHaveBeenCalledTimes(1);
    // Fora do standalone só limpa a URL.
    Object.defineProperty(window, "matchMedia", {
      value: () => ({ matches: false }),
      configurable: true,
    });
    localStorage.clear();
    window.history.replaceState(null, "", "/?origem=app");
    expect(handleFirstStandaloneOpen(track)).toBeNull();
    expect(location.search).toBe("");
  });
});
