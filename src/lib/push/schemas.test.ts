import { describe, expect, it } from "vitest";
import {
  patchBodySchema,
  pushRequestSchema,
  receiptBodySchema,
  subscribeBodySchema,
} from "./schemas";

const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
const valid = {
  endpoint: "https://fcm.googleapis.com/x",
  keys,
  targets: ["bairro:cpa"],
  installed: false,
  metricsConsent: false,
};

describe("schemas", () => {
  it("inscrição aceita só o plano; anonId e history são recusados", () => {
    expect(subscribeBodySchema.safeParse(valid).success).toBe(true);
    expect(subscribeBodySchema.safeParse({ ...valid, anonId: "x" }).success).toBe(false);
    expect(subscribeBodySchema.safeParse({ ...valid, history: [] }).success).toBe(false);
    expect(subscribeBodySchema.safeParse({ ...valid, targets: ["interesse:x"] }).success).toBe(
      false,
    );
    expect(
      subscribeBodySchema.safeParse({
        ...valid,
        prefs: {
          follow: true,
          urgent: true,
          highlight: true,
          quietStart: 23,
          quietEnd: 7,
          dailyLimit: 3,
        },
      }).success,
    ).toBe(false);
    expect(
      subscribeBodySchema.safeParse({
        ...valid,
        prefs: {
          follow: true,
          urgent: true,
          highlight: true,
          quietStart: 20,
          quietEnd: 9,
          dailyLimit: 4,
        },
      }).success,
    ).toBe(false);
  });
  it("patch exige algo e aceita seen: true", () => {
    expect(patchBodySchema.safeParse({}).success).toBe(false);
    expect(patchBodySchema.safeParse({ seen: true }).success).toBe(true);
    expect(patchBodySchema.safeParse({ seen: false }).success).toBe(false);
    expect(patchBodySchema.safeParse({ prefs: { dailyLimit: 2 } }).success).toBe(true);
  });
  it("recibo estrito", () => {
    expect(
      receiptBodySchema.safeParse({
        s: "b1000000-0000-4000-8000-000000000001",
        e: "clicked",
        d: "mobile",
        b: "chrome",
      }).success,
    ).toBe(true);
    expect(
      receiptBodySchema.safeParse({
        s: "b1000000-0000-4000-8000-000000000001",
        e: "clicked",
        d: "mobile",
        b: "chrome",
        id: "x",
      }).success,
    ).toBe(false);
  });
  it("pedido de envio: justificativa obrigatória no urgente", () => {
    const req = {
      kind: "urgent",
      articleId: "c2000000-0000-4000-8000-000000000001",
      title: "T",
      body: "B",
      audience: { type: "all" },
      when: { type: "now" },
    };
    expect(pushRequestSchema.safeParse(req).success).toBe(false);
    expect(pushRequestSchema.safeParse({ ...req, justification: "ok" }).success).toBe(true);
    expect(pushRequestSchema.safeParse({ ...req, kind: "highlight" }).success).toBe(true);
    expect(
      pushRequestSchema.safeParse({ ...req, kind: "highlight", title: "x".repeat(61) }).success,
    ).toBe(false);
  });
});
