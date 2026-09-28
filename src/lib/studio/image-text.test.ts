import { ALT_MAX, CAPTION_MAX, imageTextError, normalizeImageText } from "./image-text";

it("texto alternativo é obrigatório quando a imagem não é decorativa", () => {
  expect(imageTextError({ alt: "  ", caption: "", decorative: false })).toBe(
    "Escreva o texto alternativo ou marque a imagem como decorativa",
  );
  expect(
    imageTextError({ alt: "Ponte sobre o rio Cuiabá", caption: "", decorative: false }),
  ).toBeNull();
});

it("decorativa grava alt vazio de propósito, mesmo com texto digitado", () => {
  expect(imageTextError({ alt: "", caption: "", decorative: true })).toBeNull();
  expect(normalizeImageText({ alt: "resto", caption: "  Legenda  ", decorative: true })).toEqual({
    alt: "",
    caption: "Legenda",
    decorative: true,
  });
});

it("limites: 250 no texto alternativo e 300 na legenda", () => {
  expect(ALT_MAX).toBe(250);
  expect(CAPTION_MAX).toBe(300);
  expect(imageTextError({ alt: "a".repeat(251), caption: "", decorative: false })).toBe(
    "O texto alternativo passa de 250 caracteres",
  );
  expect(imageTextError({ alt: "a".repeat(250), caption: "", decorative: false })).toBeNull();
  expect(imageTextError({ alt: "ok", caption: "b".repeat(301), decorative: false })).toBe(
    "A legenda passa de 300 caracteres",
  );
});
