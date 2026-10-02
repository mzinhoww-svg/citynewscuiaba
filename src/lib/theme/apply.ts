export type Theme = "light" | "dark";

/** Atributo que desliga as transições enquanto o tema troca (ver globals.css). */
export const THEME_SWITCHING_ATTR = "data-theme-switching";

/**
 * Troca o tema na hora, sem animar as cores: botões, chips e cards têm `transition-colors`, e
 * sem isto a página passa uns 200 ms com cores intermediárias (contraste abaixo do mínimo e
 * piscada). Desliga as transições, aplica `data-theme`, força o cálculo de estilo e religa no
 * quadro seguinte.
 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.setAttribute(THEME_SWITCHING_ATTR, "");
  root.setAttribute("data-theme", theme);
  // Lê um estilo calculado: o navegador aplica as cores novas já sem transição.
  void getComputedStyle(root).backgroundColor;
  const restore = () => root.removeAttribute(THEME_SWITCHING_ATTR);
  if (typeof requestAnimationFrame === "function")
    requestAnimationFrame(() => requestAnimationFrame(restore));
  else restore();
}
