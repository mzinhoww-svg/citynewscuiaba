/**
 * Conteúdo extremamente duvidoso (spec de autonomia §3 e §4): o agente `verify` marcou `dubious`
 * (fato que não se sustenta, texto incoerente, fonte única sem como atribuir) ou apontou que não
 * há atribuição possível. Só isso, e fontes divergentes, levam humano ou revisor automático.
 */
export interface DubiousSignals {
  dubious?: boolean | null;
  /** O texto não permite atribuir o fato a nenhuma fonte. */
  unattributable?: boolean | null;
}

export function isDubious(...signals: readonly (DubiousSignals | null | undefined)[]): boolean {
  return signals.some((s) => s?.dubious === true || s?.unattributable === true);
}
