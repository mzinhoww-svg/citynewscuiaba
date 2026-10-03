/**
 * Datas fixas do calendário anual de Cuiabá para o bloco "Datas e eventos recorrentes de Cuiabá"
 * (fallback da Agenda quando há poucos eventos próximos). Só entra o que tem fonte verificável;
 * `source` é o link de conferência. Datas móveis ou sem fonte confiável (por exemplo, o Festival de
 * Pesca, cujas edições variam de data e cidade) ficam de fora.
 */
export interface RecurringDate {
  id: string;
  title: string;
  /** Mês (1 a 12) e dia (1 a 31) quando a data é fixa. */
  month: number;
  day?: number;
  /** Texto de quando acontece, para datas aproximadas. */
  when: string;
  place?: string;
  /** Link de conferência (instituição oficial ou veículo). */
  source: string;
  /** Rótulo curto da fonte do link. */
  sourceName: string;
}

export const RECURRING_DATES: readonly RecurringDate[] = [
  {
    id: "ano-novo",
    title: "Confraternização Universal (feriado)",
    month: 1,
    day: 1,
    when: "1 de janeiro",
    source: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10607.htm",
    sourceName: "Planalto",
  },
  {
    id: "tiradentes",
    title: "Tiradentes (feriado nacional)",
    month: 4,
    day: 21,
    when: "21 de abril",
    source: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10607.htm",
    sourceName: "Planalto",
  },
  {
    id: "aniversario-cuiaba",
    title: "Aniversário de Cuiabá (feriado municipal)",
    month: 4,
    day: 8,
    when: "8 de abril",
    place: "Cuiabá",
    source: "https://www.proximoferiado.net/dias/aniversario-de-cuiaba",
    sourceName: "Próximo Feriado",
  },
  {
    id: "trabalho",
    title: "Dia do Trabalho (feriado nacional)",
    month: 5,
    day: 1,
    when: "1 de maio",
    source: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10607.htm",
    sourceName: "Planalto",
  },
  {
    id: "sao-benedito",
    title: "Festa de São Benedito",
    month: 7,
    when: "primeira semana de julho",
    place: "Igreja Nossa Senhora do Rosário e São Benedito, Centro",
    source:
      "https://olhardireto.com.br/conceito/noticias/festa-de-sao-benedito-tem-tcha-co-bolo-missas-procissao-e-show-de-bandas-regionais",
    sourceName: "Olhar Direto",
  },
  {
    id: "independencia",
    title: "Independência do Brasil (feriado nacional)",
    month: 9,
    day: 7,
    when: "7 de setembro",
    source: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10607.htm",
    sourceName: "Planalto",
  },
  {
    id: "aparecida",
    title: "Nossa Senhora Aparecida (feriado nacional)",
    month: 10,
    day: 12,
    when: "12 de outubro",
    source: "https://www.planalto.gov.br/ccivil_03/leis/l6802.htm",
    sourceName: "Planalto",
  },
  {
    id: "finados",
    title: "Finados (feriado nacional)",
    month: 11,
    day: 2,
    when: "2 de novembro",
    source: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10607.htm",
    sourceName: "Planalto",
  },
  {
    id: "republica",
    title: "Proclamação da República (feriado nacional)",
    month: 11,
    day: 15,
    when: "15 de novembro",
    source: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10607.htm",
    sourceName: "Planalto",
  },
  {
    id: "natal",
    title: "Natal (feriado nacional)",
    month: 12,
    day: 25,
    when: "25 de dezembro",
    source: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10607.htm",
    sourceName: "Planalto",
  },
];

/** Dias até a próxima ocorrência (data fixa: dia exato; aproximada: início do mês). */
function nextOccurrence(r: RecurringDate, now: Date): Date {
  const day = r.day ?? 1;
  const mk = (y: number) => new Date(Date.UTC(y, r.month - 1, day, 12));
  const y = now.getUTCFullYear();
  const startOfToday = Date.UTC(y, now.getUTCMonth(), now.getUTCDate());
  const a = mk(y);
  // Data aproximada (sem dia) vale durante todo o mês.
  const lastDay = r.day ? a.getTime() : Date.UTC(y, r.month, 0, 23);
  return lastDay >= startOfToday ? a : mk(y + 1);
}

/** As próximas `limit` datas recorrentes, da mais próxima para a mais distante. */
export function upcomingRecurring(now: Date, limit = 4): (RecurringDate & { next: Date })[] {
  return RECURRING_DATES.map((r) => ({ ...r, next: nextOccurrence(r, now) }))
    .sort((a, b) => a.next.getTime() - b.next.getTime())
    .slice(0, limit);
}
