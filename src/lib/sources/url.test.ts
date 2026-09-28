import { err, ok } from "@/lib/result";
import { hostKey, normalizePastedUrl, slugFromName } from "./url";

describe("normalizePastedUrl", () => {
  it.each([
    ["ftp://folhadocerrado.example", "scheme"],
    ["https://u:p@folhadocerrado.example", "credentials"],
    ["https://folhadocerrado.example:8080/", "port"],
    ["https://localhost/", "forbidden_host"],
    ["https://10.0.0.5/", "forbidden_host"],
    ["https://intranet/", "forbidden_host"],
  ] as const)("%s é recusada (%s)", (input, e) => {
    expect(normalizePastedUrl(input)).toEqual(err(e));
  });

  it("recusa URL malformada e URL longa demais", () => {
    expect(normalizePastedUrl("não é url")).toEqual(err("invalid"));
    expect(normalizePastedUrl(`https://folhadocerrado.example/${"a".repeat(2048)}`)).toEqual(
      err("too_long"),
    );
  });

  it("normaliza: minúsculas, sem fragmento, sem parâmetro de rastreio, sem barra final", () => {
    expect(
      normalizePastedUrl("HTTPS://WWW.Folhadocerrado.example/cidades/?utm_source=x#top"),
    ).toEqual(ok(new URL("https://www.folhadocerrado.example/cidades")));
  });

  it("porta padrão explícita não é recusada", () => {
    expect(normalizePastedUrl("https://folhadocerrado.example:443/cidades")).toEqual(
      ok(new URL("https://folhadocerrado.example/cidades")),
    );
  });
});

describe("hostKey", () => {
  it("ignora www.", () => {
    expect(hostKey(new URL("https://www.mtagora.example/x"))).toBe("mtagora.example");
    expect(hostKey(new URL("https://mtagora.example/x"))).toBe("mtagora.example");
  });
});

describe("slugFromName", () => {
  it("remove acentos e espaços", () => {
    expect(slugFromName("Folha do Cerrado")).toBe("folha-do-cerrado");
  });
  it("nunca fica vazio", () => {
    expect(slugFromName("!!!")).toBe("fonte");
  });
});
