import type { Page } from "@playwright/test";

/**
 * `page.goto` que tenta de novo quando o WebKit avisa "interrupted by another navigation".
 * Depois do `load`, o Next chama `history.replaceState` com a própria URL ao hidratar e o WebKit
 * conta isso como navegação da mesma página: um `goto` para outra rota, feito logo em seguida,
 * cruza com ela e falha, embora a página de destino esteja correta. Só esse erro é repetido; qualquer
 * outra falha (404, timeout, rede) sobe na primeira.
 */
export async function gotoSettled(
  page: Page,
  url: string,
  options?: Parameters<Page["goto"]>[1],
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, options);
      return;
    } catch (e) {
      const interrupted = e instanceof Error && /interrupted by another navigation/.test(e.message);
      if (!interrupted || attempt >= 3) throw e;
    }
  }
}
