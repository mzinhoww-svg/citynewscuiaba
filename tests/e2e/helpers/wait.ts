/**
 * Esperas por estado para os e2e (item 91, T-18): nada de espera fixa. Quem precisa
 * esperar a página pintar usa `nextFrames`; quem confere que algo NÃO acontece (rolagem
 * automática) observa o próprio elemento numa janela curta com `scrolledWithin`, que devolve
 * assim que ele se mexe.
 */
import type { Locator, Page } from "@playwright/test";

/**
 * Espera `n` pares de quadros de pintura. No WebKit sem foco de janela (CI) o
 * `requestAnimationFrame` pode não disparar: um temporizador de reserva, dentro da página,
 * libera a espera.
 */
export async function nextFrames(page: Page, n = 1): Promise<void> {
  for (let i = 0; i < n; i++)
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          const fallback = setTimeout(done, 150);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              clearTimeout(fallback);
              done();
            }),
          );
        }),
    );
}

/**
 * Observa o elemento durante `ms` (evento `scroll` e posição) e devolve `true` assim que ele
 * rola; `false` se ficou parado a janela inteira. Serve para provar "sem rolagem automática".
 */
export function scrolledWithin(locator: Locator, ms: number): Promise<boolean> {
  return locator.evaluate(
    (el, windowMs) =>
      new Promise<boolean>((done) => {
        const start = `${el.scrollLeft}:${el.scrollTop}`;
        const moved = () => `${el.scrollLeft}:${el.scrollTop}` !== start;
        const finish = (result: boolean) => {
          el.removeEventListener("scroll", onScroll);
          clearInterval(probe);
          clearTimeout(end);
          done(result);
        };
        const onScroll = () => finish(true);
        el.addEventListener("scroll", onScroll, { passive: true });
        const probe = setInterval(() => {
          if (moved()) finish(true);
        }, 50);
        const end = setTimeout(() => finish(moved()), windowMs);
      }),
    ms,
  );
}
