import type { EvalCase } from "./eval";

/*
 * Casos de regressão da IA (P5-T6). Só fixtures fictícias (CLAUDE.md §5.10): veículos e
 * manchetes inventados, nada atribuído a veículo real. Cobrem o contrato do agente `answer`
 * (spec §5.5): responder com fonte, recusar com menos de 2 veículos independentes e nunca usar
 * patrocinado como fonte.
 */
export const EVAL_CASES: readonly EvalCase[] = [
  {
    id: "viaduto-prazo",
    question: "Quando termina a obra do viaduto na Miguel Sutil?",
    sources: [
      {
        id: "v1",
        publisher: "folha-do-cerrado",
        sourceName: "Folha do Cerrado",
        title: "Obra do viaduto na Miguel Sutil entra na fase final",
        text: "O viaduto deve ser entregue nas próximas semanas, segundo o cronograma.",
      },
      {
        id: "v2",
        publisher: "mt-agora",
        sourceName: "MT Agora",
        title: "Viaduto da Miguel Sutil tem prazo de entrega revisto",
        text: "A prefeitura revisou o prazo de entrega do viaduto.",
      },
    ],
    expect: { refuse: false, keyTerms: ["viaduto"] },
  },
  {
    id: "vacinacao-mutirao",
    question: "Onde tem mutirão de vacinação em Cuiabá?",
    sources: [
      {
        id: "s1",
        publisher: "mt-agora",
        sourceName: "MT Agora",
        title: "Mutirão de vacinação reúne postos de saúde no fim de semana",
        text: "Os postos abrem das 8h às 16h.",
      },
      {
        id: "s2",
        publisher: "diario-da-baixada",
        sourceName: "Diário da Baixada",
        title: "Vacinação contra a gripe chega a mais bairros de Cuiabá",
        text: "A campanha atende crianças e idosos.",
      },
    ],
    expect: { refuse: false, keyTerms: ["vacinacao"] },
  },
  {
    id: "uma-fonte",
    question: "O que aconteceu na feira do Porto?",
    sources: [
      {
        id: "f1",
        publisher: "folha-do-cerrado",
        sourceName: "Folha do Cerrado",
        title: "Feira do Porto muda horário de funcionamento",
        text: "A feira passa a abrir às 6h.",
      },
    ],
    expect: { refuse: true },
  },
  {
    id: "mesmo-veiculo",
    question: "Como está o trânsito na avenida do CPA?",
    sources: [
      {
        id: "t1",
        publisher: "mt-agora",
        sourceName: "MT Agora",
        title: "Trânsito na avenida do CPA tem lentidão pela manhã",
        text: "Obras reduzem uma faixa.",
      },
      {
        id: "t2",
        publisher: "mt-agora",
        sourceName: "MT Agora",
        title: "Avenida do CPA recebe sinalização nova",
        text: "A sinalização termina esta semana.",
      },
    ],
    expect: { refuse: true },
  },
  {
    // Caso de controle: a expectativa exige resposta, mas só há um veículo. O contrato manda
    // recusar, então este caso conta como recusa indevida e mantém a métrica sob observação.
    id: "controle-recusa-indevida",
    question: "Qual o cronograma da reforma da escola no Coxipó?",
    sources: [
      {
        id: "e1",
        publisher: "folha-do-cerrado",
        sourceName: "Folha do Cerrado",
        title: "Reforma da escola no Coxipó começa em outubro",
        text: "A obra deve durar quatro meses.",
      },
    ],
    expect: { refuse: false, keyTerms: ["reforma"] },
  },
];
