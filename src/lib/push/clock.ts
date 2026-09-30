/**
 * Relógio do push no servidor. Produção sempre usa o relógio real. Só o e2e (`CN_E2E=1`, o mesmo
 * opt-in de `testHostsFromEnv`) pode deslocar o "agora" de UMA chamada do drain pelo cabeçalho
 * `x-cn-e2e-now`, para os testes não dependerem da hora real: a janela de silêncio (22h–7h em
 * Cuiabá) continua valendo, só que avaliada num instante escolhido pelo teste.
 */
export const E2E_NOW_HEADER = "x-cn-e2e-now";

/** Máximo desvio aceito: 48 h, o bastante para cair no meio do dia de Cuiabá a qualquer hora. */
const MAX_SKEW_MS = 48 * 3_600_000;

export function pushClockFromRequest(
  headers: Pick<Headers, "get">,
  env: Record<string, string | undefined> = process.env,
): () => Date {
  const real = () => new Date();
  if (env.CN_E2E !== "1") return real;
  const raw = headers.get(E2E_NOW_HEADER);
  if (!raw) return real;
  const target = Date.parse(raw);
  if (!Number.isFinite(target)) return real;
  const skew = target - Date.now();
  if (Math.abs(skew) > MAX_SKEW_MS) return real;
  return () => new Date(Date.now() + skew);
}
