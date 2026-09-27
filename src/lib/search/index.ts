/**
 * Busca (P3-T10, ADR-006). Este índice só tem código puro (URL, termos, destaque, grupos) e pode
 * ir para o navegador; a consulta híbrida fica em `@/lib/search/server` (server-only).
 */
export * from "./query";
export * from "./highlight";
export * from "./group";
export type * from "./types";
