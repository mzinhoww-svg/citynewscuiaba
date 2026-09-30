import { beforeEach, describe, expect, it } from "vitest";
import {
  claimInviteSlot,
  currentInvite,
  isDeferred,
  releaseInviteSlot,
  resetInviteSlotsForTests,
} from "./slot";

beforeEach(resetInviteSlotsForTests);

describe("um convite por vez", () => {
  it("consentimento vence login, login vence notificações, notificações vencem instalação", () => {
    expect(claimInviteSlot("install", "/")).toBe(true);
    expect(claimInviteSlot("notif", "/")).toBe(true);
    expect(currentInvite()).toBe("notif");
    expect(isDeferred("install", "/")).toBe(true);
    expect(claimInviteSlot("login", "/")).toBe(true);
    expect(claimInviteSlot("consent", "/")).toBe(true);
    expect(currentInvite()).toBe("consent");
    // Quem perdeu a vez não a retoma nesta navegação.
    expect(claimInviteSlot("install", "/")).toBe(false);
    expect(claimInviteSlot("notif", "/")).toBe(false);
    releaseInviteSlot("consent");
    expect(currentInvite()).toBeNull();
    // Em outra navegação, a instalação pode tentar de novo.
    expect(isDeferred("install", "/cidade")).toBe(false);
    expect(claimInviteSlot("install", "/cidade")).toBe(true);
  });
  it("dois componentes do mesmo tipo: o segundo não solta a vaga do primeiro", () => {
    const a = Symbol("a");
    const b = Symbol("b");
    expect(claimInviteSlot("consent", "/", a)).toBe(true);
    releaseInviteSlot("consent", b);
    expect(currentInvite()).toBe("consent");
    expect(claimInviteSlot("install", "/")).toBe(false);
    releaseInviteSlot("consent", a);
    expect(currentInvite()).toBeNull();
  });
  it("liberar só solta quem segura", () => {
    claimInviteSlot("login", "/");
    releaseInviteSlot("install");
    expect(currentInvite()).toBe("login");
    expect(claimInviteSlot("login", "/")).toBe(true);
  });
});
