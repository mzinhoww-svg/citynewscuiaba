import { describe, expect, it } from "vitest";
import {
  EMPTY_APP_STATE,
  markInstalled,
  recordRead,
  recordRefusal,
  recordVisit,
  shouldOfferInstall,
  shouldOfferNotifications,
  type InstallContext,
  type NotifContext,
} from "./invites";

const NOW = new Date("2026-09-28T15:00:00Z");
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const android: InstallContext = {
  standalone: false,
  canPrompt: true,
  ios: false,
  iosSafari: false,
  path: "/",
};
const notifCtx: NotifContext = {
  pushAvailable: true,
  permission: "default",
  subscribed: false,
  ios: false,
  standalone: false,
  path: "/",
};

describe("shouldOfferInstall", () => {
  it("oferece na 2ª visita ou depois de 3 leituras", () => {
    expect(shouldOfferInstall({ ...EMPTY_APP_STATE, visits: 1, reads: 2 }, android, NOW)).toBe(
      false,
    );
    expect(shouldOfferInstall({ ...EMPTY_APP_STATE, visits: 2 }, android, NOW)).toBe("visits");
    expect(shouldOfferInstall({ ...EMPTY_APP_STATE, reads: 3 }, android, NOW)).toBe("reads");
  });

  it("Agora não silencia 14 dias; 3 recusas = nunca mais; nunca em standalone nem em /perfil", () => {
    let s = recordRefusal({ ...EMPTY_APP_STATE, visits: 5 }, "install", NOW);
    expect(shouldOfferInstall(s, android, addDays(NOW, 13))).toBe(false);
    expect(shouldOfferInstall(s, android, addDays(NOW, 15))).toBe("visits");
    s = recordRefusal(recordRefusal(s, "install", NOW), "install", NOW);
    expect(s.install.refusals).toBe(3);
    expect(shouldOfferInstall(s, android, addDays(NOW, 400))).toBe(false);
    expect(
      shouldOfferInstall({ ...EMPTY_APP_STATE, visits: 5 }, { ...android, standalone: true }, NOW),
    ).toBe(false);
    expect(shouldOfferInstall(markInstalled({ ...EMPTY_APP_STATE, visits: 5 }), android, NOW)).toBe(
      false,
    );
    for (const path of ["/perfil", "/estudio/fila", "/entrar", "/criar-conta", "/privacidade"])
      expect(
        shouldOfferInstall({ ...EMPTY_APP_STATE, visits: 5 }, { ...android, path }, NOW),
        path,
      ).toBe(false);
  });

  it("sem beforeinstallprompt e fora do iPhone não oferece (Firefox); iPhone só no Safari", () => {
    expect(
      shouldOfferInstall({ ...EMPTY_APP_STATE, visits: 5 }, { ...android, canPrompt: false }, NOW),
    ).toBe(false);
    expect(
      shouldOfferInstall(
        { ...EMPTY_APP_STATE, visits: 5 },
        { ...android, canPrompt: false, ios: true, iosSafari: true },
        NOW,
      ),
    ).toBe("visits");
    expect(
      shouldOfferInstall(
        { ...EMPTY_APP_STATE, visits: 5 },
        { ...android, canPrompt: false, ios: true, iosSafari: false },
        NOW,
      ),
    ).toBe(false);
  });

  it("2ª visita = sessão nova em outro dia ou 30 min depois", () => {
    let s = recordVisit(EMPTY_APP_STATE, NOW, true);
    expect(s.visits).toBe(1);
    // Mesma aba, navegação seguinte: não conta.
    s = recordVisit(s, new Date(NOW.getTime() + 60_000), false);
    expect(s.visits).toBe(1);
    // Aba nova 5 min depois, mesmo dia: ainda a mesma visita.
    s = recordVisit(s, new Date(NOW.getTime() + 5 * 60_000), true);
    expect(s.visits).toBe(1);
    // Aba nova 31 min depois: 2ª visita.
    s = recordVisit(s, new Date(NOW.getTime() + 36 * 60_000), true);
    expect(s.visits).toBe(2);
    // Aba nova em outro dia, 1 min depois da última atividade: 3ª visita.
    const s2 = recordVisit(
      { ...s, lastVisitDay: "2026-09-27" },
      new Date(NOW.getTime() + 37 * 60_000),
      true,
    );
    expect(s2.visits).toBe(3);
    expect(recordRead(recordRead(s)).reads).toBe(2);
  });
});

describe("shouldOfferNotifications", () => {
  it("iPhone só em standalone; permissão já decidida nunca; sem push nunca", () => {
    expect(shouldOfferNotifications(EMPTY_APP_STATE, notifCtx, NOW)).toBe(true);
    expect(
      shouldOfferNotifications(EMPTY_APP_STATE, { ...notifCtx, ios: true, standalone: false }, NOW),
    ).toBe(false);
    expect(
      shouldOfferNotifications(EMPTY_APP_STATE, { ...notifCtx, ios: true, standalone: true }, NOW),
    ).toBe(true);
    expect(
      shouldOfferNotifications(EMPTY_APP_STATE, { ...notifCtx, permission: "denied" }, NOW),
    ).toBe(false);
    expect(
      shouldOfferNotifications(EMPTY_APP_STATE, { ...notifCtx, permission: "granted" }, NOW),
    ).toBe(false);
    expect(
      shouldOfferNotifications(EMPTY_APP_STATE, { ...notifCtx, pushAvailable: false }, NOW),
    ).toBe(false);
    expect(shouldOfferNotifications(EMPTY_APP_STATE, { ...notifCtx, subscribed: true }, NOW)).toBe(
      false,
    );
    expect(shouldOfferNotifications(EMPTY_APP_STATE, { ...notifCtx, path: "/perfil" }, NOW)).toBe(
      false,
    );
  });
  it("recusas: 14 dias e 3 vezes", () => {
    const s = recordRefusal(EMPTY_APP_STATE, "notif", NOW);
    expect(shouldOfferNotifications(s, notifCtx, addDays(NOW, 13))).toBe(false);
    expect(shouldOfferNotifications(s, notifCtx, addDays(NOW, 15))).toBe(true);
    const three = recordRefusal(recordRefusal(s, "notif", NOW), "notif", NOW);
    expect(shouldOfferNotifications(three, notifCtx, addDays(NOW, 400))).toBe(false);
    // Recusar notificações não mexe na instalação.
    expect(three.install.refusals).toBe(0);
  });
});
