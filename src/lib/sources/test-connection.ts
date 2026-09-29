import { crawlGet, checkRobots, type CrawlDeps } from "@/lib/pipeline/http";
import type { SourceKind } from "@/lib/pipeline/ports";
import { detectFormat, extractEntries, hasEntityDeclaration } from "@/lib/pipeline/steps/extract";
import type { RawEntry } from "@/lib/pipeline/types";
import { isBlockedAddressMessage } from "./discover";
import { extractPageList } from "./page-list";
import type { ConsumptionConfig } from "./schema";

export const TEST_LIMIT_PER_HOUR = 30;

export interface TestConnectionResult {
  ok: boolean;
  status: number;
  items: number;
  ms: number;
  message: string;
}

export const TEST_MESSAGES = {
  forbidden: "Este endereço não é permitido.",
  timeout: "A fonte não respondeu em 10 s",
  robots: "O robots.txt da fonte não permite a coleta deste endereço",
  format: "Formato não reconhecido",
  empty: "Nenhuma notícia encontrada neste endereço",
  rateLimited: "Limite de requisições por hora atingido",
} as const;

/**
 * Baixa o endereço de coleta da fonte (feed ou página), respeitando robots e limites, e conta os
 * itens extraídos. Mensagens em pt-BR para o Estúdio. Nunca lança.
 */
export async function testConnection(
  src: {
    kind: SourceKind;
    feedUrl: string | null;
    baseUrl: string;
    consumption?: Pick<ConsumptionConfig, "page"> | Partial<ConsumptionConfig>;
  },
  deps: CrawlDeps & { now: () => number },
): Promise<TestConnectionResult> {
  const started = deps.now();
  const done = (
    ok: boolean,
    status: number,
    items: number,
    message: string,
  ): TestConnectionResult => ({
    ok,
    status,
    items,
    ms: Math.max(0, deps.now() - started),
    message,
  });
  const target = src.feedUrl ?? src.baseUrl;
  let host: string;
  try {
    host = new URL(target).hostname.toLowerCase();
  } catch {
    return done(false, 0, 0, TEST_MESSAGES.forbidden);
  }
  const limits = { bucket: `test:${host}`, limitPerHour: TEST_LIMIT_PER_HOUR };

  try {
    const robots = await checkRobots(deps, target, limits);
    if (robots.kind === "rate_limited") return done(false, 0, 0, TEST_MESSAGES.rateLimited);
    if (robots.kind === "unavailable")
      return done(
        false,
        0,
        0,
        isBlockedAddressMessage(robots.reason)
          ? TEST_MESSAGES.forbidden
          : `Não foi possível ler o robots.txt da fonte`,
      );
    if (robots.kind === "disallowed") return done(false, 0, 0, TEST_MESSAGES.robots);

    const res = await crawlGet(deps, target, limits);
    switch (res.kind) {
      case "rate_limited":
        return done(false, 0, 0, TEST_MESSAGES.rateLimited);
      case "network_error":
        return done(
          false,
          0,
          0,
          isBlockedAddressMessage(res.message)
            ? TEST_MESSAGES.forbidden
            : /timeout|timed out|abort/i.test(res.message)
              ? TEST_MESSAGES.timeout
              : "Não foi possível conectar à fonte",
        );
      case "too_large":
        return done(false, 200, 0, "A resposta da fonte é grande demais");
      case "not_modified":
        return done(false, 304, 0, TEST_MESSAGES.format);
      case "http_error":
        return done(
          false,
          res.status,
          0,
          res.status === 403
            ? "Acesso negado pela fonte (403)"
            : res.status === 404
              ? "Endereço não encontrado (404)"
              : `A fonte respondeu com erro (HTTP ${res.status})`,
        );
      case "ok": {
        const format = detectFormat(res.body);
        if (!format || (format === "html" && src.kind !== "page"))
          return done(false, res.status, 0, TEST_MESSAGES.format);
        if (format !== "html" && format !== "jsonfeed" && hasEntityDeclaration(res.body))
          return done(false, res.status, 0, TEST_MESSAGES.format);
        const selectors = src.consumption?.page;
        const entries: RawEntry[] =
          format === "html" && selectors
            ? extractPageList(res.body, res.url, selectors)
            : extractEntries(res.body, format, res.url);
        return entries.length === 0
          ? done(false, res.status, 0, TEST_MESSAGES.empty)
          : done(true, res.status, entries.length, `Conexão ok: ${entries.length} itens`);
      }
    }
  } catch {
    return done(false, 0, 0, TEST_MESSAGES.timeout);
  }
}
