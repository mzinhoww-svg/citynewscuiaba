// @vitest-environment node
import * as account from "./pt-BR/account";
import * as alerts from "./pt-BR/alerts";
import * as app from "./pt-BR/app";
import * as ask from "./pt-BR/ask";
import * as confidence from "./pt-BR/confidence";
import * as explore from "./pt-BR/explore";
import * as favorites from "./pt-BR/favorites";
import * as institutional from "./pt-BR/institutional";
import * as labels from "./pt-BR/labels";
import * as nav from "./pt-BR/nav";
import * as newsletter from "./pt-BR/newsletter";
import * as offline from "./pt-BR/offline";
import * as portalAgenda from "./pt-BR/portal-agenda";
import * as portalArticle from "./pt-BR/portal-article";
import * as portalCard from "./pt-BR/portal-card";
import * as portalHome from "./pt-BR/portal-home";
import * as portalSection from "./pt-BR/portal-section";
import * as portalTopic from "./pt-BR/portal-topic";
import * as recommendations from "./pt-BR/recommendations";
import * as search from "./pt-BR/search";
import * as site from "./pt-BR/site";
import * as sources from "./pt-BR/sources";
import * as system from "./pt-BR/system";
import * as ui from "./pt-BR/ui";

/*
 * UI-T3 (spec 2026-10-02 §4.1) e LAB-T1 (spec 2026-10-03 R16): os textos das telas públicas nunca
 * dizem "normalizado", "IA", "inteligência artificial", "resumo por IA", "publicado
 * automaticamente", "gerado", "revisado", "automático", "manipulado", "autonomia", "agente", nem
 * "confiança" (CONF-T1) e os selos de estado "Em apuração" e "Encerrado" (o estado fica só no Estúdio). Cobre também
 * estados que o e2e não alcança (assistente indisponível, limite, erro).
 * Exceções: as páginas legais de institutional.ts, a metodologia, LABEL_TEXT/LABEL_EXPLAIN (nomes
 * internos, usados no Estúdio e na metodologia).
 */
const FORBIDDEN = new RegExp(
  [
    "normaliz",
    "\\bIA\\b",
    "inteligência artificial",
    "resumo por ia",
    "publicad[oa] automaticamente",
    "gerad[oa]s?\\b",
    "revisad[oa]s?\\b",
    "automaticamente",
    "automátic[oa]s?\\b",
    "manipulad",
    "autonomia",
    "\\bagentes?\\b",
    "em apuração",
    "encerrad[oa]s?\\b",
    "confian[cç]a",
  ].join("|"),
  "i",
);

/** Endereços e identificadores não são texto de tela. */
const SKIPPED_KEYS = new Set(["href", "id", "path"]);
const LEGAL_EXPORTS = new Set(["AI_USE", "PRIVACY", "TERMS", "METHOD", "PRINCIPLES"]);
const INTERNAL_EXPORTS = new Set(["LABEL_TEXT", "LABEL_EXPLAIN"]);

/** Todas as strings de um módulo de conteúdo; funções são chamadas com argumentos de exemplo. */
function strings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8) return out;
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") {
    for (const args of [[2], ["Exemplo"], [2, 3], ["Exemplo", "Exemplo"]]) {
      try {
        strings((value as (...a: unknown[]) => unknown)(...args), out, depth + 1);
      } catch {
        /* argumentos de exemplo não servem para esta função */
      }
    }
  } else if (Array.isArray(value)) for (const v of value) strings(v, out, depth + 1);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      if (SKIPPED_KEYS.has(k)) continue;
      strings(v, out, depth + 1);
    }
  return out;
}

const MODULES: Record<string, Record<string, unknown>> = {
  account,
  alerts,
  app,
  ask,
  confidence,
  explore,
  favorites,
  institutional,
  labels,
  nav,
  newsletter,
  offline,
  portalAgenda,
  portalArticle,
  portalCard,
  portalHome,
  portalSection,
  portalTopic,
  recommendations,
  search,
  site,
  sources,
  system,
  ui,
};

for (const [name, mod] of Object.entries(MODULES)) {
  it(`conteúdo público ${name} não usa o vocabulário aposentado`, () => {
    const found: string[] = [];
    for (const [key, value] of Object.entries(mod)) {
      if (LEGAL_EXPORTS.has(key) || INTERNAL_EXPORTS.has(key)) continue;
      for (const s of strings(value))
        if (FORBIDDEN.test(s)) found.push(`${key}: ${s.slice(0, 90)}`);
    }
    expect(found).toEqual([]);
  });
}

it("os links para a página legal de uso de IA se chamam 'Como funciona o CityNews'", () => {
  const links = [...nav.FOOTER_NAV, ...institutional.RELATED_LINKS].filter(
    (l) => l.href === "/como-usamos-ia",
  );
  expect(links.length).toBe(2);
  for (const l of links) expect(l.label).toBe("Como funciona o CityNews");
});

it("a página de assunto não tem textos de apuração, confiança nem placeholder vazio", () => {
  const found = strings(portalTopic.TOPIC).filter((s) =>
    /confian|Nada registrado|divergem|concordam|Ainda não confirmado|em apuração/i.test(s),
  );
  expect(found).toEqual([]);
});

it("o único selo de estado do assunto que o público vê é 'Corrigido' (R16)", () => {
  expect(Object.keys(portalCard.TOPIC_STATE_TEXT)).toEqual(["corrigido"]);
  expect(portalCard.TOPIC_STATE_TEXT.corrigido).toBe("Corrigido");
});
