import { expect, type Locator } from "@playwright/test";

/**
 * Espera o React hidratar o elemento (ele ganha as chaves internas `__reactProps$…`/`__reactFiber$…`
 * ao ser adotado). Sem isso, um `fill`/`click` feito entre o HTML do servidor e a hidratação é
 * perdido: a hidratação devolve o valor inicial ao campo ou o clique cai num botão sem `onClick`.
 * O WebKit do runner de CI hidrata mais devagar que o Chromium e expõe a corrida.
 */
export async function expectHydrated(target: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        target.evaluate((el) =>
          Object.keys(el).some(
            (k) => k.startsWith("__reactProps$") || k.startsWith("__reactFiber$"),
          ),
        ),
      { message: "elemento ainda não hidratado", timeout: 15_000 },
    )
    .toBe(true);
}
