import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadJson } from "./LocalProfileCard";

describe("downloadJson (gate P2, M8)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("só revoga o endereço depois que o navegador começou o download", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:perfil");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadJson("perfil.json", "{}");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith("blob:perfil");
  });
});
