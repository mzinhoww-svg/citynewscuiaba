import Module from "node:module";
import { join } from "node:path";

/*
 * Os módulos do pipeline começam com `import "server-only"`, que lança fora do bundler do Next.
 * Como no vitest (alias para o módulo vazio), o pedido de `server-only` é resolvido para o vazio.
 * Este arquivo precisa ser o primeiro import de quem carrega esses módulos.
 */
type Resolver = (request: string, ...rest: unknown[]) => string;
const mod = Module as unknown as { _resolveFilename: Resolver };
const original = mod._resolveFilename;
const EMPTY = join(process.cwd(), "node_modules/server-only/empty.js");
mod._resolveFilename = function (request: string, ...rest: unknown[]) {
  return request === "server-only" ? EMPTY : original.call(this, request, ...rest);
};
