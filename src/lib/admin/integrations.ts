import { resolveProviderKind } from "@/lib/ai/registry";

/**
 * Estado das integrações do painel A13. Só booleanos e nomes públicos saem daqui: nenhum valor de
 * variável de ambiente (chave, URL com credencial, token) chega à tela.
 */
export const INTEGRATION_IDS = ["supabase", "openrouter", "email", "google", "vercel"] as const;
export type IntegrationId = (typeof INTEGRATION_IDS)[number];

/**
 * - `connected`: em uso de verdade.
 * - `simulated`: em uso com o substituto de teste (IA falsa).
 * - `pending`: depende de credencial que ainda não existe (bloqueio registrado).
 * - `error`: configurada, mas não responde.
 * - `off`: não se aplica neste ambiente.
 */
export type IntegrationState = "connected" | "simulated" | "pending" | "error" | "off";

export interface IntegrationView {
  id: IntegrationId;
  state: IntegrationState;
  /** Bloqueio que explica o estado (BLOCKERS.md). */
  blocker?: "B-003" | "B-005" | "B-006" | "B-008";
  /** Fato não sensível para a linha (ambiente, região, tamanho da fila). */
  fact?: string;
}

export interface IntegrationProbes {
  /** O banco respondeu a uma leitura simples. */
  dbOk: boolean;
  /** E-mails do plantão e alertas na fila `queued` (sem provedor: B-005). */
  queuedEmails: number;
}

type Env = Record<string, string | undefined>;
const set = (v: string | undefined) => (v ?? "").trim() !== "";

export function integrationStates(env: Env, probes: IntegrationProbes): IntegrationView[] {
  const dbConfigured =
    set(env.NEXT_PUBLIC_SUPABASE_URL) &&
    set(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    set(env.SUPABASE_SERVICE_ROLE_KEY);
  const supabase: IntegrationView = {
    id: "supabase",
    state: !dbConfigured ? "off" : probes.dbOk ? "connected" : "error",
  };

  const ai = resolveProviderKind(env);
  const openrouter: IntegrationView =
    ai === "openrouter"
      ? { id: "openrouter", state: "connected" }
      : { id: "openrouter", state: "simulated", blocker: "B-008" };

  // O SMTP do Auth fica no painel do Supabase; o envio de newsletter e alertas ainda não tem provedor.
  const email: IntegrationView = {
    id: "email",
    state: "pending",
    blocker: "B-005",
    fact: String(probes.queuedEmails),
  };

  const google: IntegrationView =
    env.AUTH_GOOGLE_ENABLED === "1"
      ? { id: "google", state: "connected" }
      : { id: "google", state: "pending", blocker: "B-006" };

  const onVercel = env.VERCEL === "1";
  const vercel: IntegrationView = onVercel
    ? { id: "vercel", state: "connected", fact: env.VERCEL_ENV || undefined }
    : { id: "vercel", state: "off" };

  return [supabase, openrouter, email, google, vercel];
}
