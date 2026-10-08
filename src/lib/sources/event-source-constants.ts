/**
 * Constantes da fonte de eventos que as telas (cliente) usam sem levar `event-source.ts`, que
 * valida URL com `pipeline/net` (Node). Puro, sem dependência de servidor.
 */
import type { SourceKind as ExtractKind } from "@/lib/agenda/types";

export const EXTRACT_KINDS: readonly ExtractKind[] = [
  "jsonld",
  "ical",
  "rss",
  "sympla",
  "tribe",
  "ai_page",
];
export const EVENT_ORIGINS = ["official", "organizer"] as const;
export type EventOrigin = (typeof EVENT_ORIGINS)[number];
