import "server-only";
import type { LogoOrigin, LogoOutcome, LogoSourceRow, LogoStore } from "@/lib/sources/logo-sync";
import { LOGO_BUCKET, logoObjectPath } from "@/lib/sources/logo-path";
import type { DbClient } from "./client";

const OUTCOMES = new Set<string>(["found", "none", "robots", "unreachable", "error"]);

/**
 * Banco e Storage da rotina de logotipos. Cliente de serviço (rota do pipeline ou ação do Painel):
 * grava no bucket `source-logos` pelo mesmo caminho do upload manual e atualiza a fonte pela RPC
 * `source_logo_auto_set`, que nunca pisa em logotipo `manual`.
 */
export function createSourceLogoStore(db: DbClient): LogoStore {
  return {
    async listSources(): Promise<LogoSourceRow[]> {
      const [sources, checks] = await Promise.all([
        db
          .from("sources")
          .select("id, slug, name, display_name, base_url, logo_path, logo_source")
          .neq("kind", "events")
          .is("archived_at", null)
          .in("status", ["active", "degraded", "paused"])
          .order("slug"),
        db.from("source_logo_checks").select("source_id, checked_at, found_at, outcome"),
      ]);
      if (sources.error) throw new Error(`fontes: ${sources.error.message}`);
      const byId = new Map((checks.data ?? []).map((c) => [c.source_id, c]));
      return (sources.data ?? []).map((s) => {
        const c = byId.get(s.id);
        return {
          id: s.id,
          slug: s.slug,
          name: s.display_name ?? s.name,
          baseUrl: s.base_url,
          logoPath: s.logo_path,
          logoSource:
            s.logo_source === "manual" || s.logo_source === "auto"
              ? (s.logo_source as LogoOrigin)
              : null,
          checkedAt: c?.checked_at ?? null,
          foundAt: c?.found_at ?? null,
          outcome: c && OUTCOMES.has(c.outcome) ? (c.outcome as LogoOutcome) : null,
        };
      });
    },

    async saveLogo(row, found) {
      const path = logoObjectPath(row.id, found.bytes, found.contentType);
      const up = await db.storage
        .from(LOGO_BUCKET)
        .upload(path, found.bytes, { contentType: found.contentType, upsert: true });
      if (up.error) return "error";
      const { data, error } = await db.rpc("source_logo_auto_set", {
        p_id: row.id,
        p_path: path,
        p_origin: found.originUrl,
      });
      if (error || data === "not_found") {
        await db.storage.from(LOGO_BUCKET).remove([path]);
        return "error";
      }
      if (data === "manual") {
        // Uma pessoa definiu o logotipo no meio do caminho: nada fica órfão no bucket.
        await db.storage.from(LOGO_BUCKET).remove([path]);
        return "manual";
      }
      if (row.logoPath && row.logoPath !== path) {
        await db.storage.from(LOGO_BUCKET).remove([row.logoPath]);
      }
      return "saved";
    },

    async recordCheck(id, outcome, detail, found) {
      const now = new Date().toISOString();
      const { error } = await db.from("source_logo_checks").upsert({
        source_id: id,
        checked_at: now,
        outcome,
        detail: detail.slice(0, 300),
        ...(found ? { found_at: now } : {}),
      });
      if (error)
        console.error("logos das fontes: falha ao registrar a checagem", id, error.message);
    },
  };
}
