import { XMLValidator } from "fast-xml-parser";
import { err, ok } from "@/lib/result";
import { MAX_DOCUMENT_BYTES } from "../http";
import type { IngestRepo, RawItemRecord } from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import { repairTruncatedSitemap } from "../sitemap";
import { detectFormat, hasEntityDeclaration } from "./extract";

/** Motivo para recusar o documento, ou `null` se ele pode seguir para a extração. */
export function validateRaw(raw: RawItemRecord): string | null {
  const { status, sourceKind } = raw.payload;
  // Prefixo de sitemap (`truncated`) termina no meio de uma `<url>`: valida o reparado, que é o que
  // a extração lê. Reparar um documento completo é no-op.
  const body = raw.payload.truncated ? repairTruncatedSitemap(raw.payload.body) : raw.payload.body;
  if (status !== 200) return `HTTP ${status}`;
  if (!body.trim()) return "documento vazio";
  if (body.length > MAX_DOCUMENT_BYTES) return "documento maior que 5 MB";
  const format = detectFormat(body);
  if (!format) return "formato desconhecido (esperado RSS, Atom, sitemap, JSON Feed ou página)";
  if (format === "html" && sourceKind !== "page")
    return "HTML no lugar do feed (página de erro ou feed movido)";
  if (format !== "html" && format !== "jsonfeed") {
    if (hasEntityDeclaration(body)) return "XML com entidades declaradas";
    const v = XMLValidator.validate(body);
    if (v !== true) return `XML malformado: ${v.err.msg} (linha ${v.err.line})`;
  }
  return null;
}

/** Etapa 3: documento bruto → válido ou quarentena. */
export function createValidateStep(deps: { repo: IngestRepo }): StepHandler {
  return async (msg) => {
    const id = msg.itemRef.replace(/^raw:/, "");
    const raw = await deps.repo.rawItem(id);
    if (!raw) return err(stepError.notFound(`raw_item ${id} não encontrado`));
    const problem = validateRaw(raw);
    if (problem) {
      await deps.repo.updateRawItem(id, { state: "quarantine", error: problem });
      return err(stepError.invalid(problem, { rawId: id }));
    }
    await deps.repo.updateRawItem(id, { state: "valid" });
    const { etag, lastModified } = raw.payload;
    if (etag !== undefined || lastModified !== undefined)
      await deps.repo.updateSource(raw.sourceId, {
        etag: etag ?? null,
        lastModified: lastModified ?? null,
      });
    return ok([nextMessage(msg, "extract", `raw:${id}`)]);
  };
}
