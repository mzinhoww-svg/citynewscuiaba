/**
 * "Testar conexão" (spec §7.1/§9, interface de P5-T4): baixa a URL configurada da fonte e diz, em
 * pt-BR, se deu certo. Nunca `fetch` direto — sempre `checkRobots`/`crawlGet`.
 */
import type { z } from "zod";
import { checkRobots, crawlGet, type CrawlDeps } from "@/lib/pipeline/http";
import type { SourceKind } from "@/lib/pipeline/ports";
import { detectFormat, extractEntries } from "@/lib/pipeline/steps/extract";
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

/**
 * Baixa a URL da fonte (feed configurado, ou o endereço base para `page`/`page_list`) e conta os
 * itens extraídos. `deps.now()` mede a duração em milissegundos.
 */
export async function testConnection(
  src: TestConnectionSource,
  deps: CrawlDeps & { now: () => number },
): Promise<TestConnectionResult> {
  const start = deps.now();
  const ms = () => deps.now() - start;
  const url = src.feedUrl ?? src.baseUrl;
  const limits = {
    bucket: `test-connection:${new URL(url).hostname.toLowerCase()}`,
    limitPerHour: TEST_LIMIT_PER_HOUR,
  };

  const robots = await checkRobots(deps, url, limits);
  if (robots.kind === "rate_limited")
    return result(false, 0, 0, ms(), "Limite de requisições por hora atingido");
  if (robots.kind === "unavailable")
    return result(false, 0, 0, ms(), "A fonte não respondeu em 10 s");
  if (robots.kind === "disallowed")
    return result(false, 0, 0, ms(), "O robots.txt da fonte não permite a coleta deste endereço");

  const res = await crawlGet(deps, url, limits);
  switch (res.kind) {
    case "rate_limited":
      return result(false, 0, 0, ms(), "Limite de requisições por hora atingido");
    case "http_error":
      if (res.status === 403) return result(false, 403, 0, ms(), "Acesso negado pela fonte (403)");
      if (res.status === 404) return result(false, 404, 0, ms(), "Endereço não encontrado (404)");
      return result(false, res.status, 0, ms(), `A fonte respondeu com erro (HTTP ${res.status})`);
    case "network_error":
      return result(false, 0, 0, ms(), "A fonte não respondeu em 10 s");
    case "too_large":
      return result(false, 0, 0, ms(), "Documento maior que o limite permitido");
    case "not_modified":
      return result(true, 304, 0, ms(), "Conexão ok: 0 itens");
    case "ok": {
      const format = detectFormat(res.body);
      if (!format) return result(false, res.status, 0, ms(), "Formato não reconhecido");
      const entries = extractEntries(res.body, format, url);
      if (entries.length === 0)
        return result(false, res.status, 0, ms(), "Nenhuma notícia encontrada neste endereço");
      return result(true, res.status, entries.length, ms(), `Conexão ok: ${entries.length} itens`);
    }
  }
}
