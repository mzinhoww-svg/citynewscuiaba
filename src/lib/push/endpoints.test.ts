import { describe, expect, it } from "vitest";
import { fakeResolve } from "@/lib/pipeline/testing/fake-http";
import {
  endpointHost,
  endpointProblem,
  endpointResolvesSafely,
  testHostsFromEnv,
} from "./endpoints";

describe("endpointProblem (Review Focus 4)", () => {
  it.each([
    ["https://fcm.googleapis.com.evil.example/x", "host"],
    ["https://u:p@fcm.googleapis.com/x", "credentials"],
    ["https://fcm.googleapis.com:8443/x", "port"],
    ["http://fcm.googleapis.com/x", "scheme"],
    ["https://push.apple.com/x", "host"],
    ["https://evilpush.apple.com/x", "host"],
    ["https://xnotify.windows.com/x", "host"],
    ["https://169.254.169.254/x", "host"],
    ["notaurl", "invalid"],
    ["", "invalid"],
    [`https://fcm.googleapis.com/${"a".repeat(1100)}`, "too_long"],
  ])("%s → %s", (raw, problem) => expect(endpointProblem(raw, [])).toBe(problem));

  it("aceita hosts da lista, maiúsculas, ponto final e porta 443 explícita", () => {
    expect(endpointProblem("https://FCM.GOOGLEAPIS.COM./fcm/send/abc", [])).toBeNull();
    expect(endpointProblem("https://fcm.googleapis.com:443/x", [])).toBeNull();
    expect(endpointProblem("https://web.push.apple.com/x", [])).toBeNull();
    expect(endpointProblem("https://updates.push.services.mozilla.com/wpush/v2/x", [])).toBeNull();
    expect(endpointProblem("https://wns2-bn1p.notify.windows.com/w/?token=x", [])).toBeNull();
  });

  it("host de teste aceita http e a porta dada; outra porta não", () => {
    expect(endpointProblem("http://127.0.0.1:9999/ok", ["127.0.0.1:9999"])).toBeNull();
    expect(endpointProblem("http://127.0.0.1:9998/ok", ["127.0.0.1:9999"])).toBe("scheme");
    expect(endpointProblem("http://127.0.0.1:9999/ok", [])).toBe("scheme");
  });

  it("host permitido que resolve para IP privado é recusado", async () => {
    expect(
      await endpointResolvesSafely(
        new URL("https://fcm.googleapis.com/x"),
        fakeResolve({ "fcm.googleapis.com": ["10.0.0.5"] }),
        [],
      ),
    ).toBe(false);
    expect(
      await endpointResolvesSafely(new URL("https://fcm.googleapis.com/x"), fakeResolve({}), []),
    ).toBe(true);
    expect(
      await endpointResolvesSafely(
        new URL("https://fcm.googleapis.com/x"),
        async () => {
          throw new Error("dns");
        },
        [],
      ),
    ).toBe(false);
    expect(
      await endpointResolvesSafely(new URL("http://127.0.0.1:9999/x"), fakeResolve({}), [
        "127.0.0.1:9999",
      ]),
    ).toBe(true);
  });

  it("hosts de teste são ignorados em produção", () => {
    expect(
      testHostsFromEnv({ PUSH_ENDPOINT_TEST_HOSTS: "127.0.0.1:9999", VERCEL_ENV: "production" }),
    ).toEqual([]);
    expect(
      testHostsFromEnv({ PUSH_ENDPOINT_TEST_HOSTS: "127.0.0.1:9999", NODE_ENV: "production" }),
    ).toEqual([]);
    expect(
      testHostsFromEnv({
        PUSH_ENDPOINT_TEST_HOSTS: "127.0.0.1:9999",
        NODE_ENV: "production",
        CN_E2E: "1",
      }),
    ).toEqual(["127.0.0.1:9999"]);
    expect(
      testHostsFromEnv({
        PUSH_ENDPOINT_TEST_HOSTS: "127.0.0.1:9999",
        VERCEL_ENV: "production",
        CN_E2E: "1",
      }),
    ).toEqual([]);
    expect(testHostsFromEnv({ PUSH_ENDPOINT_TEST_HOSTS: "127.0.0.1:9999, bad host" })).toEqual([
      "127.0.0.1:9999",
    ]);
    expect(testHostsFromEnv({})).toEqual([]);
  });

  it("endpointHost normaliza", () => {
    expect(endpointHost("https://FCM.GOOGLEAPIS.COM./x")).toBe("fcm.googleapis.com");
    expect(endpointHost("lixo")).toBeNull();
  });
});
