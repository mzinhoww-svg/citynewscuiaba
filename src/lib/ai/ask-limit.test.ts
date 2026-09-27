import { expect, it } from "vitest";
import { ASK_LIMITS, askBucket, askRetryAt } from "./ask-limit";

it("20/h sem conta e 60/h com conta, em baldes separados", () => {
  expect(ASK_LIMITS).toEqual({ anon: 20, account: 60 });
  expect(askBucket("anon")).not.toBe(askBucket("account"));
});

it("libera na virada da janela de 1 h", () => {
  expect(askRetryAt(new Date("2026-09-27T18:42:10Z"))).toBe("2026-09-27T19:00:00.000Z");
  expect(askRetryAt(new Date("2026-09-27T19:00:00Z"))).toBe("2026-09-27T20:00:00.000Z");
});
