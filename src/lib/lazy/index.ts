import type { ComponentType } from "react";

/**
 * Carregador para `React.lazy` que nunca derruba a página (B-018):
 *
 * ```ts
 * const X = lazy(() => safeDefault(() => import("./X").then((m) => m.X)));
 * ```
 *
 * Se o chunk não chega (rede caiu, aba offline), `lazy` puro lança o erro para a fronteira de erro
 * mais próxima. Aqui o pedaço carregado sob demanda só some (renderiza nada), e o resto da
 * página continua funcionando.
 */
export function safeDefault<P extends object>(
  load: () => Promise<ComponentType<P>>,
): Promise<{ default: ComponentType<P> }> {
  return load()
    .then((component) => ({ default: component }))
    .catch(() => ({ default: () => null }));
}
