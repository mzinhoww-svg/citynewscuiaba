import { describe, expect, it } from "vitest";
import { err } from "@/lib/result";
import { buildPayload, internalUrl, pushHeaders, tagFor } from "./payload";

const SEND = "b1000000-0000-4000-8000-000000000001";
const base = {
  title: "Chuva forte",
  body: "Defesa Civil alerta",
  originLabel: "ORIGINAL CITYNEWS",
  url: "/materia/chuva",
  tag: "a1",
  sendId: SEND,
};

describe("buildPayload", () => {
  it("rótulo aposentado de envio antigo sai com o texto público (R16)", () => {
    const r = buildPayload({ ...base, originLabel: "PUBLICADO AUTOMATICAMENTE" });
    expect(r.ok && r.value.b).toBe("ORIGINAL CITYNEWS · Defesa Civil alerta");
    const n = buildPayload({ ...base, originLabel: "NORMALIZADO PELO CITYNEWS" });
    expect(n.ok && n.value.b).toBe("Feito a partir de outras fontes · Defesa Civil alerta");
  });

  it("payload só com v,t,b,u,g,s e ≤ 1 KB; URL externa recusada", () => {
    const r = buildPayload(base);
    expect(r.ok && Object.keys(r.value).sort()).toEqual(["b", "g", "s", "t", "u", "v"]);
    expect(r.ok && r.value.b).toBe("ORIGINAL CITYNEWS · Defesa Civil alerta");
    expect(r.ok && r.value.t).toBe("Chuva forte");
    expect(buildPayload({ ...base, url: "//evil.example" })).toEqual(err("bad_url"));
    expect(buildPayload({ ...base, url: "https://evil.example/x" })).toEqual(err("bad_url"));
    expect(buildPayload({ ...base, url: "/x\ny" })).toEqual(err("bad_url"));
    expect(buildPayload({ ...base, url: `/${"x".repeat(1100)}` })).toEqual(err("too_large"));
  });

  it("corta título em 60 e corpo em 120 (prefixo fora)", () => {
    const r = buildPayload({ ...base, title: "t".repeat(80), body: "<i>b</i>".repeat(200) });
    expect(r.ok && [...r.value.t].length).toBe(60);
    expect(r.ok && r.value.b.startsWith("ORIGINAL CITYNEWS · ")).toBe(true);
    expect(r.ok && [...r.value.b.slice("ORIGINAL CITYNEWS · ".length)].length).toBe(120);
  });

  it("internalUrl", () => {
    expect(["/", "/materia/x", "/cidade?a=1"].map(internalUrl)).toEqual([true, true, true]);
    expect(["//x", "http://x", "x", "/\\x", ""].map(internalUrl)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("Urgency high só no urgente; TTL 6/2/12 h; Topic só com tag válida", () => {
    expect(pushHeaders("urgent", "x")).toMatchObject({ TTL: 7200, Urgency: "high", Topic: "x" });
    expect(pushHeaders("highlight", "x")).toMatchObject({ TTL: 43200, Urgency: "normal" });
    expect(pushHeaders("follow", "x")).toMatchObject({ TTL: 21600, Urgency: "normal" });
    expect(pushHeaders("follow", "tem espaço")).not.toHaveProperty("Topic");
    expect(pushHeaders("follow", "x".repeat(33))).not.toHaveProperty("Topic");
  });

  it("tag = id sem hífens (32 caracteres)", () => {
    expect(tagFor("c2000000-0000-4000-8000-000000000001")).toBe("c2000000000040008000000000000001");
    expect(tagFor("c2000000-0000-4000-8000-000000000001")).toHaveLength(32);
  });
});
