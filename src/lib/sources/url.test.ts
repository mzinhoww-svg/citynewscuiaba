import { err } from "@/lib/result";
import { hostKey, normalizePastedUrl, slugFromName } from "./url";

describe("normalizePastedUrl", () => {
  it.each([
    ["ftp://folhadocerrado.example", "scheme"],
    ["https://u:p@folhadocerrado.example", "credentials"],
    ["https://folhadocerrado.example:8080/", "port"],
    ["https://localhost/", "forbidden_host"],
    ["https://10.0.0.5/", "forbidden_host"],
    ["https://[::1]/", "forbidden_host"],
    ["https://intranet/", "forbidden_host"],
    ["", "invalid"],
    ["https://", "invalid"],
    ["não é url", "invalid"],
  ])("%s é recusada (%s)", (input, e) => expect(normalizePastedUrl(input)).toEqual(err(e)));

  it("recusa URL longa demais", () =>
    expect(normalizePastedUrl(`https://folhadocerrado.example/${"a".repeat(2100)}`)).toEqual(
      err("too_long"),
    ));

  it("normaliza: host minúsculo, sem tracking, fragmento nem barra final", () => {
    const r = normalizePastedUrl("HTTPS://WWW.Folhadocerrado.example/cidades/?utm_source=x#top");
    expect(r.ok && r.value.href).toBe("https://www.folhadocerrado.example/cidades");
  });
  it("aceita sem esquema, portas padrão e mantém a raiz", () => {
    const a = normalizePastedUrl("  mtagora.example ");
    expect(a.ok && a.value.href).toBe("https://mtagora.example/");
    const b = normalizePastedUrl("https://mtagora.example:443/feed?b=2&a=1");
    expect(b.ok && b.value.href).toBe("https://mtagora.example/feed?a=1&b=2");
    expect(normalizePastedUrl("http://mtagora.example:80/").ok).toBe(true);
  });
  it("hostKey tira www e caixa", () => {
    expect(hostKey(new URL("https://WWW.MTAgora.example/x"))).toBe("mtagora.example");
  });
  it("slugFromName", () => {
    expect(slugFromName("Folha do Cerrado")).toBe("folha-do-cerrado");
    expect(slugFromName("  Rádio Pantanal FM — 98,1! ")).toBe("radio-pantanal-fm-98-1");
    expect(slugFromName("MT Agora")).toBe("mt-agora");
    expect(slugFromName("!!!")).toBe("");
  });
});
