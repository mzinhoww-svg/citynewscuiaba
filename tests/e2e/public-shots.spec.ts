import { expect, test } from "@playwright/test";

/*
 * UI-T0: as 16 rotas públicas do inventário da spec 2026-10-02 respondem 200 e têm um h1.
 * São as mesmas rotas que `pnpm design:shoot` fotografa (scripts/shoot-public.mjs); se uma
 * delas sair do ar, a baseline de capturas deixa de valer.
 */
const ROUTES = [
  "/",
  "/cidade",
  "/busca?q=prefeitura",
  "/pergunte",
  "/fontes",
  "/panorama",
  "/agenda",
  "/explorar",
  "/assuntos",
  "/favoritos",
  "/alertas",
  "/newsletter",
  "/entrar",
  "/perfil",
  "/sobre",
  "/como-usamos-ia",
];

for (const route of ROUTES) {
  test(`rota pública ${route} responde 200 com h1`, async ({ page }) => {
    const res = await page.goto(route);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });
}
