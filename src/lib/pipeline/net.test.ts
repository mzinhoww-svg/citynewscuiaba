import { isForbiddenAddress, isForbiddenHost, readLimited, safeGet, urlProblem } from "./net";
import { createFakeHttp, fakeResolve } from "./testing/fake-http";

const opts = (extra: Partial<Parameters<typeof safeGet>[2]> = {}) => ({
  headers: {},
  signal: AbortSignal.timeout(5000),
  maxBytes: 1024,
  ...extra,
});

describe("faixas de IP proibidas", () => {
  it.each([
    "0.1.2.3",
    "10.0.0.8",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "224.0.0.1",
    "239.255.255.250",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "febf::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "::127.0.0.1",
    "::7f00:1",
    "64:ff9b::a9fe:a9fe",
    "2002:c0a8:0101::1",
    "ff02::1",
  ])("%s é proibido", (ip) => expect(isForbiddenAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "93.184.215.14", "172.32.0.1", "100.128.0.1", "2606:4700::1111"])(
    "%s é público",
    (ip) => expect(isForbiddenAddress(ip)).toBe(false),
  );
});

describe("host antes do DNS", () => {
  it("formas numéricas alternativas de 127.0.0.1 são normalizadas e recusadas", () => {
    for (const u of [
      "http://2130706433/",
      "http://0x7f.1/",
      "http://017700000001/",
      "http://127.1/",
      "http://[::ffff:127.0.0.1]/",
      "http://[0:0:0:0:0:ffff:7f00:1]/",
    ])
      expect(isForbiddenHost(new URL(u).hostname)).toBe(true);
  });

  it("nomes internos são recusados", () => {
    for (const h of ["localhost", "a.localhost", "db.internal", "nas.local", "x.home.arpa"])
      expect(isForbiddenHost(h)).toBe(true);
    expect(isForbiddenHost("folhadocerrado.example")).toBe(false);
  });
});

describe("DNS", () => {
  it("recusa nome que resolve para QUALQUER endereço privado", async () => {
    const resolve = fakeResolve({ "mix.example": ["93.184.215.14", "10.0.0.5"] });
    expect(await urlProblem(new URL("https://mix.example/feed"), resolve)).toMatch(/10\.0\.0\.5/);
  });

  it("recusa IPv6 mapeado vindo do DNS", async () => {
    const resolve = fakeResolve({ "v6.example": ["::ffff:169.254.169.254"] });
    expect(await urlProblem(new URL("https://v6.example/"), resolve)).toMatch(/não permitido/);
  });

  it("falha de DNS vira motivo, nunca acesso", async () => {
    const resolve = async () => {
      throw new Error("ENOTFOUND");
    };
    expect(await urlProblem(new URL("https://x.example/"), resolve)).toMatch(/DNS/);
  });

  it("nome público segue", async () =>
    expect(await urlProblem(new URL("https://ok.example/"), fakeResolve())).toBeNull());
});

describe("safeGet", () => {
  it("segue redirecionamento revalidando cada salto e recusa o que aponta para rede interna", async () => {
    const { http, calls } = createFakeHttp({
      "https://a.example/feed": { status: 302, headers: { location: "http://169.254.169.254/x" } },
    });
    const r = await safeGet({ http, resolve: fakeResolve() }, "https://a.example/feed", opts());
    expect(r).toEqual({ kind: "blocked", reason: expect.stringMatching(/169\.254/) });
    expect(calls.map((c) => c.url)).toEqual(["https://a.example/feed"]);
  });

  it("recusa redirecionamento para nome que resolve para IP privado", async () => {
    const { http, calls } = createFakeHttp({
      "https://a.example/feed": { status: 301, headers: { location: "https://evil.example/" } },
    });
    const resolve = fakeResolve({ "evil.example": ["127.0.0.1"] });
    const r = await safeGet({ http, resolve }, "https://a.example/feed", opts());
    expect(r.kind).toBe("blocked");
    expect(calls).toHaveLength(1);
  });

  it("usa redirect manual, segue no máximo 3 saltos", async () => {
    const hop = (n: number) => ({ status: 302, headers: { location: `/h${n + 1}` } });
    const { http, calls } = createFakeHttp({
      "https://a.example/h0": hop(0),
      "https://a.example/h1": hop(1),
      "https://a.example/h2": hop(2),
      "https://a.example/h3": hop(3),
      "https://a.example/h4": { body: "fim" },
    });
    const r = await safeGet({ http, resolve: fakeResolve() }, "https://a.example/h0", opts());
    expect(r).toEqual({ kind: "blocked", reason: expect.stringMatching(/3 redirecionamentos/) });
    expect(calls.every((c) => c.redirect === "manual")).toBe(true);

    const three = await safeGet({ http, resolve: fakeResolve() }, "https://a.example/h1", opts());
    expect(three.kind).toBe("ok");
    if (three.kind === "ok") expect(three.url).toBe("https://a.example/h4");
  });

  it("allowUrl vale para cada salto", async () => {
    const { http } = createFakeHttp({
      "https://img.fonte.example/a.jpg": {
        status: 302,
        headers: { location: "https://cdn.outro.example/a.jpg" },
      },
    });
    const r = await safeGet({ http, resolve: fakeResolve() }, "https://img.fonte.example/a.jpg", {
      ...opts(),
      allowUrl: (u) => (u.hostname.endsWith("fonte.example") ? null : `fora da fonte: ${u.host}`),
    });
    expect(r).toEqual({ kind: "blocked", reason: "fora da fonte: cdn.outro.example" });
  });

  it("corta o corpo no limite mesmo sem content-length", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(400));
        if (pulled > 50) c.close();
      },
    });
    const res = new Response(stream);
    expect(res.headers.get("content-length")).toBeNull();
    expect(await readLimited(res, 1000)).toBeNull();
    expect(pulled).toBeLessThan(10);
  });

  it("content-length acima do limite nem lê o corpo", async () => {
    const { http } = createFakeHttp({
      "https://a.example/big": { body: "x", headers: { "content-length": "5000" } },
    });
    const r = await safeGet({ http, resolve: fakeResolve() }, "https://a.example/big", opts());
    expect(r.kind).toBe("too_large");
  });
});
