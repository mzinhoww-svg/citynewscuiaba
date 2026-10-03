import { SECTIONS } from "../../src/content/pt-BR/nav";
import { PERMISSIONS, ROLES, type Action, type Role } from "../../src/lib/auth/permissions";
import type { StaffKey } from "../e2e/helpers/studio-login";

/*
 * Manifesto das rotas de docs/screens.md que a varredura de acessibilidade percorre
 * (tests/a11y/all-routes.spec.ts). Slugs e ids são os do seed (supabase/seed.sql).
 * Os papéis de cada rota do Estúdio saem da matriz de permissões do produto
 * (src/lib/auth/permissions.ts), então nenhuma rota fica sem o papel que a usa.
 */

const ARTICLE = "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro";

/** P01–P16, P24–P26 e as telas de conta que funcionam sem entrar (C02–C05). Sem sessão. */
export const PUBLIC_ROUTES: string[] = [
  "/",
  ...SECTIONS.map((s) => s.href), // P02, as nove editorias
  "/cidade?sub=mobilidade&bairro=coxipo&periodo=7d",
  ARTICLE, // P03
  `${ARTICLE}/historico`, // P04
  "/materia/materia-arquivada-seed",
  "/assunto/obra-do-viaduto-na-miguel-sutil", // P05
  "/assuntos", // P06
  "/explorar", // P07
  "/colecoes/seca-e-fumaca", // P08
  "/colecoes/outubro-em-cuiaba",
  "/agenda", // P09
  "/agenda?view=cal",
  "/agenda/noite-de-rasqueado-no-sesc-arsenal", // P10
  "/agenda/sugerir", // P11
  "/busca", // P12
  "/busca?q=onibus+cpa",
  "/busca?q=viaduto&origem=outros",
  "/busca?q=viadutu",
  "/pergunte", // P13
  "/pergunte?q=O%20que%20aconteceu%20em%20Cuiab%C3%A1%20hoje%3F",
  "/pergunte?q=Resuma%20sa%C3%BAde%20p%C3%BAblica%20no%20Coxip%C3%B3",
  "/pergunte?q=viaduto%20%5Bteste%3Atempo-esgotado%5D",
  "/fontes", // P14
  "/fontes/folha-do-cerrado", // P15
  "/panorama", // P16
  "/favoritos", // P17
  "/alertas", // P18
  "/alertas/confirmar?estado=expirado",
  "/alertas/confirmar?estado=invalido",
  "/newsletter", // P19
  "/newsletter/preferencias", // sem link assinado
  "/perfil", // P20
  "/privacidade/recomendacoes", // P21
  "/privacidade", // P22
  "/sobre", // P24
  "/principios-editoriais",
  "/correcoes",
  "/direito-de-resposta",
  "/termos",
  "/anuncie",
  "/contato",
  "/app", // P26
  "/materia/nao-existe", // P25
  "/nao/existe",
  "/entrar", // C02
  "/entrar?motivo=sem-permissao",
  "/criar-conta", // C03
  "/recuperar-senha", // C04
  "/redefinir-senha",
  "/confirmar?estado=expirado", // C05
  "/confirmar?estado=invalido",
  "/entrar/migrar", // C06 sem sessão: segue para /entrar
];

/** Telas que o leitor com conta vê de outro jeito (P17, P18, P20, P21, C06). */
export const READER_ROUTES: string[] = [
  "/favoritos",
  "/alertas",
  "/perfil",
  "/privacidade/recomendacoes",
  "/entrar/migrar",
  "/newsletter",
];

/** Rotas curtas com o banner de consentimento aberto (primeira visita, sem `cn_consent`). */
export const FIRST_VISIT_ROUTES: string[] = [
  "/",
  ARTICLE,
  "/busca?q=viaduto",
  "/privacidade",
  "/entrar",
];

/** Ids que só existem depois de criar dados no teste (fixtures) ou de ler o banco. */
export interface Ids {
  runId: string;
  experimentId: string;
  correctionId: string;
  pushSendId: string;
}

export interface StudioRoute {
  name: string;
  path: (ids: Ids) => string;
  /** Ação da matriz que dá acesso (quem a tem em algum escopo entra na tela). */
  action: Action | readonly Action[] | "any-staff";
  /** Papéis a excluir (já cobertos por outro spec, com o motivo no comentário do item). */
  except?: readonly Role[];
  /** Restringe os papéis derivados da matriz (a tela só faz sentido para eles). */
  only?: readonly Role[];
}

const FOLHA = "c5000000-0000-4000-8000-000000000001";
const P = (s: string) => () => s;

export const STUDIO_ROUTES: StudioRoute[] = [
  // Redação (E01 a E14)
  { name: "E01 newsroom", path: P("/estudio"), action: "any-staff" },
  { name: "E02 fila", path: P("/estudio/fila"), action: "article.edit" },
  { name: "E02 fila de exceção", path: P("/estudio/fila?aba=exceptions"), action: "article.edit" },
  { name: "E02 minha fila", path: P("/estudio/fila?aba=mine"), action: "article.edit" },
  {
    name: "E03 revisão",
    path: P("/estudio/fila/c2000000-0000-4000-8000-000000000020"),
    action: "article.edit",
  },
  {
    name: "E04 editor",
    path: P("/estudio/materias/c2000000-0000-4000-8000-000000000004"),
    action: "article.edit", // o jornalista vê "Seu papel não permite editar esta matéria" (outra pessoa)
  },
  {
    name: "E04 editor (rascunho próprio)",
    path: P("/estudio/materias/c2000000-0000-4000-8000-000000000023"),
    action: "article.edit",
    only: ["jornalista"],
  },
  {
    name: "E05 versões",
    path: P("/estudio/materias/c2000000-0000-4000-8000-000000000004/versoes"),
    action: "article.edit",
    except: ["jornalista"],
  },
  { name: "E07 calendário", path: P("/estudio/calendario"), action: "article.edit" },
  { name: "E08 correções", path: P("/estudio/correcoes"), action: "correction.manage" },
  {
    name: "E08 correção",
    path: (i) => `/estudio/correcoes/${i.correctionId}`,
    action: "correction.manage",
  },
  { name: "E09 mídia", path: P("/estudio/midia"), action: "media.approve" },
  {
    name: "E10 imagem",
    path: P("/estudio/midia/c6000000-0000-4000-8000-000000000003"),
    action: "media.approve",
  },
  { name: "E11 licenças", path: P("/estudio/midia/licencas"), action: "media.approve" },
  {
    name: "E13 sugestões de evento",
    path: P("/estudio/agenda/sugestoes"),
    action: "article.publish",
  },
  { name: "E14 denúncias", path: P("/estudio/denuncias"), action: "reports.moderate" },
  // Control Center (O01 a O18)
  { name: "O01 visão geral", path: P("/estudio/control"), action: "metrics.view" },
  { name: "O02 tempo real", path: P("/estudio/control/tempo-real"), action: "metrics.view" },
  {
    name: "O03 fontes",
    path: P("/estudio/control/fontes"),
    action: "source.manage",
    except: ["admin"],
  },
  {
    name: "O03 fontes sem resultado",
    path: P("/estudio/control/fontes?q=nada-com-esse-nome"),
    action: "source.manage",
    except: ["admin"],
  },
  {
    name: "O04 nova fonte",
    path: P("/estudio/control/fontes/nova"),
    action: "source.manage",
    except: ["admin"],
  },
  {
    name: "O04 fonte",
    path: P(`/estudio/control/fontes/${FOLHA}`),
    action: "source.manage",
    except: ["admin"],
  },
  ...["configuracao", "coleta", "recomendacao", "historico", "itens"].map((aba): StudioRoute => ({
    name: `O04 fonte · ${aba}`,
    path: P(`/estudio/control/fontes/${FOLHA}/${aba}`),
    action: "source.manage",
    except: ["admin"], // o admin (Helena) é coberto em 360, 768 e 1280 px por control-sources.spec.ts
  })),
  { name: "O05 regras", path: P("/estudio/control/regras"), action: "rules.propose" },
  { name: "O05 aprovações", path: P("/estudio/control/aprovacoes"), action: "rules.propose" },
  { name: "O06 falhas", path: P("/estudio/control/falhas"), action: "source.manage" },
  { name: "O07 execuções", path: P("/estudio/control/execucoes"), action: "metrics.view" },
  {
    name: "O07 ciclo",
    path: (i) => `/estudio/control/execucoes/${i.runId}`,
    action: "metrics.view",
  },
  { name: "O08 logs", path: P("/estudio/control/logs"), action: "audit.view" },
  {
    name: "O08 logs sem resultado",
    path: P("/estudio/control/logs?q=nada-encontrado-xyz"),
    action: "audit.view",
  },
  { name: "O09 custos", path: P("/estudio/control/custos"), action: "metrics.view" },
  { name: "O10 agentes", path: P("/estudio/control/agentes"), action: "metrics.view" },
  { name: "O11 modelos", path: P("/estudio/control/modelos"), action: "metrics.view" },
  { name: "O12 prompts", path: P("/estudio/control/prompts/answer"), action: "metrics.view" },
  {
    name: "O12 prompt inexistente",
    path: P("/estudio/control/prompts/nada"),
    action: "metrics.view",
    only: ["operador_ia"],
  },
  { name: "O13 conhecimento", path: P("/estudio/control/conhecimento"), action: "metrics.view" },
  { name: "O14 avaliações", path: P("/estudio/control/avaliacoes"), action: "metrics.view" },
  { name: "O15 playground", path: P("/estudio/control/testes"), action: "metrics.view" },
  { name: "O16 governança da IA", path: P("/estudio/control/governanca"), action: "metrics.view" },
  { name: "O17 recomendação", path: P("/estudio/control/recomendacao"), action: "metrics.view" },
  {
    name: "O18 teste A/B",
    path: (i) => `/estudio/control/recomendacao/testes/${i.experimentId}`,
    action: "metrics.view",
  },
  {
    name: "O18 teste A/B inexistente",
    path: P("/estudio/control/recomendacao/testes/nada"),
    action: "metrics.view",
    only: ["operador_ia"],
  },
  // Administração (A01 a A15)
  { name: "A01 painel", path: P("/estudio/admin"), action: "users.manage" },
  { name: "A02 usuários", path: P("/estudio/admin/usuarios"), action: "users.manage" },
  { name: "A03 papéis", path: P("/estudio/admin/papeis"), action: "users.manage" },
  { name: "A04 equipes", path: P("/estudio/admin/equipes"), action: "users.manage" },
  { name: "A05 taxonomia", path: P("/estudio/admin/taxonomia"), action: "site.manage" },
  { name: "A06 home e módulos", path: P("/estudio/admin/home"), action: "site.manage" },
  { name: "A07 publicidade", path: P("/estudio/admin/publicidade"), action: "site.manage" },
  { name: "A08 SEO", path: P("/estudio/admin/seo"), action: "site.manage" },
  // A09: Helena é coberta em 390, 768 e 1280 px por pwa.spec.ts; aqui entram os outros papéis.
  {
    name: "A09 novo envio",
    path: P("/estudio/admin/notificacoes"),
    // Quem só tem `push.metrics` (analista) é levado ao funil, que tem linha própria abaixo.
    action: ["push.request", "push.approve", "push.settings"],
    except: ["admin"],
  },
  {
    name: "A09 fila",
    path: P("/estudio/admin/notificacoes/fila"),
    action: ["push.request", "push.approve", "push.settings"],
    except: ["admin"],
  },
  {
    name: "A09 histórico",
    path: P("/estudio/admin/notificacoes/historico"),
    action: ["push.request", "push.approve", "push.settings"],
    except: ["admin"],
  },
  {
    name: "A09 envio",
    path: (i) => `/estudio/admin/notificacoes/historico/${i.pushSendId}`,
    action: ["push.request", "push.approve", "push.settings"],
    except: ["admin"],
  },
  {
    name: "A09 funil",
    path: P("/estudio/admin/notificacoes/funil"),
    action: "push.metrics",
    except: ["admin"],
  },
  {
    name: "A09 configurações",
    path: P("/estudio/admin/notificacoes/configuracoes"),
    action: "push.settings",
    except: ["admin"],
  },
  { name: "A10 auditoria", path: P("/estudio/admin/auditoria"), action: "audit.view" },
  {
    name: "A10 auditoria vazia",
    path: P("/estudio/admin/auditoria?acao=nada-xyz"),
    action: "audit.view",
    only: ["admin"],
  },
  { name: "A11 segurança", path: P("/estudio/admin/seguranca"), action: "users.manage" },
  { name: "A12 governança editorial", path: P("/estudio/admin/governanca"), action: "site.manage" },
  { name: "A13 integrações", path: P("/estudio/admin/integracoes"), action: "users.manage" },
  { name: "A14 configurações", path: P("/estudio/admin/configuracoes"), action: "users.manage" },
  { name: "A15 contingência", path: P("/estudio/admin/contingencia"), action: "users.manage" },
];

/** Uma pessoa do seed por papel (supabase/seed.sql: um papel por pessoa, jornalista com Juliana). */
export const STAFF_BY_ROLE: Record<Role, StaffKey> = {
  admin: "helena",
  editor_chefe: "marina",
  editor: "otavio",
  jornalista: "juliana",
  revisor: "beatriz",
  operador_ia: "diego",
  analista: "thiago",
  moderador: "carlos",
  leitura: "paulo",
};

/** Papéis que a matriz permite para a rota, na ordem da matriz (o primeiro é o representante). */
export function rolesFor(route: StudioRoute): Role[] {
  const roles = new Set<Role>();
  if (route.action === "any-staff") return ROLES.filter((r) => !route.except?.includes(r));
  const actions: readonly Action[] =
    typeof route.action === "string" ? [route.action] : route.action;
  for (const a of actions) for (const r of Object.keys(PERMISSIONS[a]) as Role[]) roles.add(r);
  return [...roles].filter(
    (r) => !route.except?.includes(r) && (!route.only || route.only.includes(r)),
  );
}
