// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parsePackageItems } from "./social-packages";

const base = {
  eventId: "e1",
  slug: "e1",
  title: "Noite do Siriri",
  day: "2026-10-13",
  dayLabel: "Terça, 13 de outubro",
  time: "19h",
  venue: "Praça",
  price: null,
  origin: null,
};

describe("parsePackageItems", () => {
  it("'Ver original' só com http(s): outro esquema vira null", () => {
    const [a, b] = parsePackageItems([
      { ...base, image: { assetId: "a", credit: "F", originUrl: "javascript:alert(1)" } },
      { ...base, image: { assetId: "b", credit: "F", originUrl: "https://f.example/e" } },
    ]);
    expect(a?.image?.originUrl).toBeNull();
    expect(b?.image?.originUrl).toBe("https://f.example/e");
  });

  it("item antigo sem `source` continua válido; marca de título cortado é lida", () => {
    const [it] = parsePackageItems([{ ...base, image: null, titleClamped: true }]);
    expect(it).toMatchObject({ source: null, titleClamped: true });
    expect(parsePackageItems([{ nada: 1 }, "x"])).toEqual([]);
  });
});
