import { describe, expect, it } from "vitest";
import {
  publicPushOrigin,
  pushOriginLabel,
  sanitizeNotificationText,
  withOriginLabel,
} from "./text";

describe("sanitizeNotificationText", () => {
  it("remove HTML e controle, normaliza espaços, corta por grafema", () => {
    expect(sanitizeNotificationText("<b>Chuva</b>\u0007 forte\n em Cuiabá", 60)).toBe(
      "Chuva forte em Cuiabá",
    );
    expect(sanitizeNotificationText("a &amp; b&nbsp;c", 60)).toBe("a & b c");
    const flags = "🇧🇷".repeat(5);
    expect(sanitizeNotificationText(flags, 3)).toBe("🇧🇷🇧🇷…");
    expect(sanitizeNotificationText("x".repeat(70), 60)).toHaveLength(60);
    expect(sanitizeNotificationText("x".repeat(70), 60).endsWith("…")).toBe(true);
    expect(sanitizeNotificationText("", 60)).toBe("");
  });

  it("rótulo de origem vai na frente e fora do máximo", () => {
    expect(withOriginLabel("ORIGINAL CITYNEWS", "Defesa Civil alerta")).toBe(
      "ORIGINAL CITYNEWS · Defesa Civil alerta",
    );
    expect(withOriginLabel("", "x")).toBe("x");
  });
});

// LAB-T1 (R16): a notificação nunca diz "publicado automaticamente" nem "normalizado".
describe("rótulo de origem da notificação", () => {
  it("matéria própria leva ORIGINAL CITYNEWS; texto derivado, a origem em frase", () => {
    expect(pushOriginLabel("original")).toBe("ORIGINAL CITYNEWS");
    expect(pushOriginLabel("normalized")).toBe("Feito a partir de outras fontes");
  });

  it("não depende do modo de publicação (automático não aparece)", () => {
    expect(pushOriginLabel("original")).not.toMatch(/autom/i);
    expect(pushOriginLabel("normalized")).not.toMatch(/autom|normaliz/i);
  });

  it("envios antigos com o rótulo aposentado saem com o texto público", () => {
    expect(publicPushOrigin("PUBLICADO AUTOMATICAMENTE")).toBe("ORIGINAL CITYNEWS");
    expect(publicPushOrigin("NORMALIZADO PELO CITYNEWS")).toBe("Feito a partir de outras fontes");
    expect(publicPushOrigin("ORIGINAL CITYNEWS")).toBe("ORIGINAL CITYNEWS");
    expect(publicPushOrigin("")).toBe("");
  });
});
