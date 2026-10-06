import "server-only";
import { createMemoryMediaStore } from "@/lib/media/store";
import type { ServableAsset, ServeMediaDeps } from "@/lib/media/serve";
import { createPublicClient, createServiceClient } from "./client";
import { createSupabaseMediaStore } from "./media-store";
import { createFlags } from "./pipeline-store";

const KINDS = new Set<ServableAsset["kind"]>([
  "original",
  "reproduction",
  "licensed",
  "illustrative",
  "ai_generated",
]);
const STATUSES = new Set<ServableAsset["status"]>(["pending", "approved", "blocked"]);

/**
 * Dependências da rota `/api/media/[id]`. O asset é lido com o cliente público (a RLS
 * `media_assets_read_public` já exige `approved` e a flag para reprodução); a rota confere de
 * novo. A URL assinada do bucket privado sai com a service role, só no servidor.
 * Lança `SupabaseEnvError` sem variáveis do Supabase.
 */
export function mediaServeDeps(): ServeMediaDeps {
  const pub = createPublicClient();
  const service = createServiceClient();
  const flags = createFlags(service);
  return {
    async asset(id) {
      const { data, error } = await pub
        .from("media_assets")
        .select("id, kind, status, storage_path, content_type, width")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) return null;
      const kind = data.kind as ServableAsset["kind"];
      const status = data.status as ServableAsset["status"];
      if (!KINDS.has(kind) || !STATUSES.has(status)) return null;
      return {
        id: data.id,
        kind,
        status,
        storagePath: data.storage_path,
        contentType: data.content_type,
        width: data.width,
      };
    },
    reproductionEnabled: () => flags.isEnabled("image_reproduction_enabled"),
    // Pilha local sem Storage (A-017): `MEDIA_STORE=memory` só fora de produção.
    store:
      process.env.MEDIA_STORE === "memory" && process.env.NODE_ENV !== "production"
        ? createMemoryMediaStore()
        : createSupabaseMediaStore(service),
  };
}
