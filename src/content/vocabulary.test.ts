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
 * UI-T3 (spec 2026-10-02 §4.1): os textos das telas públicas nunca dizem "normalizado", "IA",
 * "inteligência artificial", "resumo por IA", "publicado automaticamente" nem "gerado por IA".
 * Cobre também estados que o e2e não alcança (assistente indisponível, limite, erro).
 * Exceções: as páginas legais de institutional.ts, a metodologia, LABEL_TEXT/LABEL_EXPLAIN (nomes
 * internos, usados no Estúdio e na metodologia) e o rótulo de imagem gerada (não há gerador hoje).
 */
const FORBIDDEN =
  /normaliz|\bIA\b|inteligência artificial|resumo por ia|publicado automaticamente|gerad[oa] por ia/i;

/** Endereços e identificadores não são texto de tela; `ai_generated` é o rótulo de imagem gerada. */
const SKIPPED_KEYS = new Set(["href", "id", "path", "ai_generated"]);
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
