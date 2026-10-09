/**
 * Textos do pacote "Agenda da semana" do Instagram @citycuiabaa (ARD-T6, spec
 * 2026-10-08-agenda-rica-e-distribuicao §7): slides e legenda. Sem emoji (regra do portal) e com
 * no máximo três hashtags fixas. O Estúdio usa `studio-agenda.ts`.
 */
export const SOCIAL_AGENDA = {
  handle: "@citycuiabaa",
  brand: "CityNews Cuiabá",
  /** Capa. */
  coverTitle: "Agenda da semana",
  /** A capa quebra o título em duas linhas fixas. */
  coverTitleLines: ["Agenda da", "semana"],
  coverKicker: "Cuiabá e Várzea Grande",
  coverCount: (n: number) => (n === 1 ? "1 evento escolhido" : `${n} eventos escolhidos`),
  /** "12 a 18 de outubro"; cruzando o mês, "28 de setembro a 4 de outubro". */
  range: (from: string, to: string) => `${from} a ${to}`,
  /** Slide de evento. */
  slideIndex: (i: number, n: number) => `${i} de ${n}`,
  unknownPrice: "Preço: consulte a fonte",
  freePrice: "Gratuito",
  photoCredit: (source: string) => `Foto: reprodução web · ${source}`,
  /** "Desde 4 out" (evento já em cartaz antes da semana). */
  since: (date: string) => `Desde ${date}`,
  /** Slide final. */
  closingTitle: "Qual você vai?",
  closingHint: "A agenda completa está no CityNews Cuiabá.",
  /** Legenda. */
  captionIntro: (range: string) =>
    `Agenda da semana em Cuiabá e Várzea Grande, de ${range}. Separamos estes eventos para você.`,
  captionDay: (v: string) => `Dia: ${v}`,
  captionTime: (v: string) => `Hora: ${v}`,
  captionPlace: (v: string) => `Local: ${v}`,
  captionPrice: (v: string) => `Preço: ${v}`,
  captionMore: (n: number) =>
    n === 1 ? "Mais 1 evento nos slides." : `Mais ${n} eventos nos slides.`,
  captionPhotos: (sources: string) => `Fotos: reprodução web · ${sources}`,
  captionClosing: "Confirme horários e valores na fonte oficial antes de sair de casa.",
  /** `creditos.txt` do ZIP. */
  creditsTitle: "Créditos do pacote Agenda da semana",
  creditsSlide: (n: string, title: string) => `Slide ${n} · ${title}`,
  photoCreditLine: (source: string) => `Foto: reprodução web · ${source}`,
  noPhoto: "Sem foto (fundo liso)",
  creditsOriginal: (url: string) => `Original: ${url}`,
  hashtags: ["#Cuiabá", "#AgendaCuiabá", "#CityNews"] as const,
} as const;
