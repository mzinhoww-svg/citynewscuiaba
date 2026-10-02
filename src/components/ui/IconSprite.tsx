import { ICON_SPRITE } from "./icon-sprite";

/**
 * Sprite dos ícones da interface: um `<symbol id="icon-<nome>">` por ícone, renderizado uma vez
 * no layout raiz (só no servidor; o navegador recebe o SVG pronto, sem JS). O `<Icon>` referencia
 * cada símbolo com `<use>`. Fora da tela e sem acessibilidade: é só um catálogo.
 */
export function IconSprite() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute size-0 overflow-hidden"
      dangerouslySetInnerHTML={{ __html: ICON_SPRITE }}
    />
  );
}
