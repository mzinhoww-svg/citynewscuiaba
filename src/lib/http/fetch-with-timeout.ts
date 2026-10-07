/**
 * `fetch` com prazo (itens 82 e 83): a requisição que passa de `timeoutMs` é abortada com
 * `TimeoutError`, para que um Supabase ou uma rota lenta não segure a página, o worker ou o
 * polling indefinidamente. O sinal de quem chama continua valendo (o que abortar primeiro vence).
 * `base` permite embrulhar outro `fetch`; sem ele, usa o `fetch` global do momento da chamada.
 *
 * ```ts
 * createClient(url, key, { global: { fetch: fetchWithTimeout(8000) } });
 * ```
 */
export function fetchWithTimeout(timeoutMs: number, base?: typeof fetch): typeof fetch {
  return (input, init) => {
    const ctrl = new AbortController();
    const outer = init?.signal;
    // O prazo cobre também a leitura do corpo, então o relógio não é limpo na resposta;
    // `unref` (Node) evita que ele segure o processo de um script.
    const timer: { unref?: () => void } | number = setTimeout(
      () => ctrl.abort(new DOMException(`Prazo de ${timeoutMs} ms esgotado`, "TimeoutError")),
      timeoutMs,
    );
    if (typeof timer === "object") timer.unref?.();
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener("abort", () => ctrl.abort(outer.reason), { once: true });
    }
    return (base ?? fetch)(input, { ...init, signal: ctrl.signal });
  };
}

/** Erro de prazo vencido produzido por `fetchWithTimeout` (ou `AbortSignal.timeout`). */
export function isTimeoutError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "TimeoutError";
}
