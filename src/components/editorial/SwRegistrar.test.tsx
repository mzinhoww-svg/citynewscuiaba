import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const registerSwOnIdle = vi.fn();
const sendConsentToSw = vi.fn().mockResolvedValue(undefined);
let pathname = "/cidade";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/lib/offline/sw", () => ({
  registerSwOnIdle: (p: string) => registerSwOnIdle(p),
  sendConsentToSw: (c: unknown) => sendConsentToSw(c),
}));

import { ConsentProvider } from "@/lib/consent/client";
import { parseConsent } from "@/lib/consent";
import { SwRegistrar } from "./SwRegistrar";

afterEach(() => {
  registerSwOnIdle.mockClear();
  sendConsentToSw.mockClear();
});

describe("SwRegistrar", () => {
  it("registra no caminho atual e manda o consentimento ao montar", () => {
    render(
      <ConsentProvider initial={parseConsent("v1|m1|p0")}>
        <SwRegistrar />
      </ConsentProvider>,
    );
    expect(registerSwOnIdle).toHaveBeenCalledWith("/cidade");
    expect(sendConsentToSw).toHaveBeenCalledWith({ metrics: true });
  });

  it("Só o necessário manda metrics falso; pathname do Estúdio é passado adiante (o registro recusa)", () => {
    pathname = "/estudio/fila";
    render(
      <ConsentProvider initial={parseConsent("v1|m0|p0")}>
        <SwRegistrar />
      </ConsentProvider>,
    );
    expect(registerSwOnIdle).toHaveBeenCalledWith("/estudio/fila");
    expect(sendConsentToSw).toHaveBeenCalledWith({ metrics: false });
  });
});
