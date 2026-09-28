/**
 * "Testar conexão" (spec §7.1/§9, interface de P5-T4): baixa a URL configurada da fonte e diz, em
 * pt-BR, se deu certo. Nunca `fetch` direto — sempre `checkRobots`/`crawlGet`.
 */
import type { z } from "zod";
import { isForbiddenTarget } from "./discover";
import { checkRobots, crawlGet, type CrawlDeps } from "@/lib/pipeline/http";
import type { SourceKind } from "@/lib/pipeline/ports";
import { detectFormat, extractEntries, extractFromPage } from "@/lib/pipeline/steps/extract";
import { extractPageList } from "./page-list";
import type { consumptionSchema } from "./schema";

export type Consumption = z.infer<typeof consumptionSchema>;

export interface TestConnectionSource {
  kind: SourceKind;
  feedUrl: string | null;
  baseUrl: string;
  consumption?: Consumption;
}

export interface TestConnectionResult {
  ok: boolean;
  status: number;
  items: number;
  ms: number;
  message: string;
}

const TEST_LIMIT_PER_HOUR = 30;

function result(
  ok: boolean,
  status: number,
  items: number,
  ms: number,
  message: string,
): TestConnectionResult {
  return { ok, status, items, ms, message };
}

/** "1 item" / "n itens" (achado 8): plural de verdade, texto do briefing preservado ao pé da letra. */
function itemsMessage(n: number): string {
  return `Conexão ok: ${n} ${n === 1 ? "item" : "itens"}`;
}

/**
 * Baixa a URL da fonte (feed configurado, ou o endereço base para `page`/`page_list`) e conta os
 * itens extraídos — respeitando `consumption.strategy` quando informado (uma `page_list` usa os
 * seletores da fonte, não a Readability de uma página qualquer). `deps.now()` mede a duração em
 * milissegundos. `deps.callerId`, quando presente, é quem pede o teste (30/h por pessoa, spec
 * §11); sem ele, a cota fica por host, e quem chamar isto do Estúdio (FS-T6) deve passar a pessoa.
 */
export async function testConnection(
  src: TestConnectionSource,
  deps: CrawlDeps & { now: () => number; callerId?: string },
): Promise<TestConnectionResult> {
  const start = deps.now();
  const ms = () => deps.now() - start;
  const rawUrl = src.feedUrl ?? src.baseUrl;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return result(false, 0, 0, ms(), "Endereço da fonte inválido.");
  }
  if (await isForbiddenTarget(url, deps.resolve))
    return result(false, 0, 0, ms(), "Este endereço não é permitido.");

  const limits = {
    bucket: `test-connection:${deps.callerId ?? url.hostname.toLowerCase()}`,
    limitPerHour: TEST_LIMIT_PER_HOUR,
  };

  const robots = await checkRobots(deps, rawUrl, limits);
  if (robots.kind === "rate_limited")
    return result(false, 0, 0, ms(), "Limite de requisições por hora atingido");
  if (robots.kind === "unavailable")
    return result(false, 0, 0, ms(), "A fonte não respondeu em 10 s");
  if (robots.kind === "disallowed")
    return result(false, 0, 0, ms(), "O robots.txt da fonte não permite a coleta deste endereço");

  const res = await crawlGet(deps, rawUrl, limits);
  switch (res.kind) {
    case "rate_limited":
      return result(false, 0, 0, ms(), "Limite de requisições por hora atingido");
    case "http_error":
      if (res.status === 403) return result(false, 403, 0, ms(), "Acesso negado pela fonte (403)");
      if (res.status === 404) return result(false, 404, 0, ms(), "Endereço não encontrado (404)");
      return result(false, res.status, 0, ms(), `A fonte respondeu com erro (HTTP ${res.status})`);
    case "network_error":
      return result(
        false,
        0,
        0,
        ms(),
        res.blocked ? "Este endereço não é permitido." : "A fonte não respondeu em 10 s",
      );
    case "too_large":
      return result(false, 0, 0, ms(), "Documento maior que o limite permitido");
    case "not_modified":
      return result(true, 304, 0, ms(), itemsMessage(0));
    case "ok": {
      const format = detectFormat(res.body);
      if (!format) return result(false, res.status, 0, ms(), "Formato não reconhecido");
      const pageSelectors =
        src.consumption?.strategy === "page_list" ? src.consumption.pageSelectors : null;
      const entries =
        format === "html" && pageSelectors
          ? extractPageList(res.body, rawUrl, pageSelectors)
          : format === "html" && src.consumption?.strategy === "page_article"
            ? extractFromPage(res.body, rawUrl)
            : extractEntries(res.body, format, rawUrl);
      if (entries.length === 0)
        return result(false, res.status, 0, ms(), "Nenhuma notícia encontrada neste endereço");
      return result(true, res.status, entries.length, ms(), itemsMessage(entries.length));
    }
  }
}
