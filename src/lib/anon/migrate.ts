import type { AlertChannel, AnonProfile, DismissReason, FollowKind, LocalAlert } from "./types";

/**
 * Migração do perfil deste navegador para a conta (spec §5.4, docs/screens.md C06). Pura: quem
 * lê a conta e grava é a Server Action de `/entrar/migrar`.
 *
 * Cada caixa leva um grupo:
 * - `follows`: fontes, temas, editorias e coleções seguidas, e os alertas;
 * - `saved`: matérias salvas (com o progresso) e coleções pessoais;
 * - `interests`: interesses considerados e fontes ocultadas (o que ajusta as recomendações);
 * - `history`: histórico de leitura dos últimos 30 dias (desmarcado por padrão);
 * - `conversations`: conversas com a IA (desmarcado; hoje nada fica guardado no navegador).
 * O que a conta já tem não é gravado de novo (conflito: mantém os dois lados, sem duplicar).
 */
export interface MigrationChoice {
  follows: boolean;
  saved: boolean;
  interests: boolean;
  history: boolean;
  conversations: boolean;
}

export const DEFAULT_MIGRATION_CHOICE: MigrationChoice = {
  follows: true,
  saved: true,
  interests: true,
  history: false,
  conversations: false,
};

export interface RemoteAccountData {
  /** Fontes seguidas na conta (slugs). */
  follows: string[];
  /** Salvos da conta (`article:<id>`). */
  saved: string[];
  otherFollows?: { kind: FollowKind; id: string }[];
  alerts?: { kind: string; target: string; channel: AlertChannel }[];
  /** Nomes das coleções pessoais da conta. */
  collections?: string[];
}

export interface MigrationPlan {
  /** Fontes a gravar (as que a conta ainda não tem). */
  follows: string[];
  saved: { ref: string; progress: number }[];
  /** Chaves dos interesses a levar. */
  interests: string[];
  /** Quantas leituras do histórico vão junto. */
  history: number;
  summary: string;
  otherFollows: { kind: FollowKind; id: string }[];
  alerts: LocalAlert[];
  collections: { name: string; items: string[] }[];
  hidden: { sourceSlug: string; reason: DismissReason }[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 fontes e 3 salvos sincronizados", "1 fonte sincronizada", "3 salvos sincronizados". */
export function migrationSummary(sources: number, saved: number): string {
  if (sources > 0 && saved > 0)
    return `${plural(sources, "fonte", "fontes")} e ${plural(saved, "salvo", "salvos")} sincronizados`;
  if (sources > 0) return `${plural(sources, "fonte sincronizada", "fontes sincronizadas")}`;
  if (saved > 0) return `${plural(saved, "salvo sincronizado", "salvos sincronizados")}`;
  return "Preferências sincronizadas";
}

/** Contagens mostradas ao lado de cada caixa. */
export function migrationCounts(local: AnonProfile): Record<keyof MigrationChoice, number> {
  return {
    follows: local.follows.length,
    saved: local.saved.length,
    interests: local.interests.length,
    history: local.history.length,
    conversations: 0,
  };
}

/** `true` quando há algo neste navegador que valha oferecer para a conta. */
export function hasLocalData(local: AnonProfile): boolean {
  return (
    local.follows.length > 0 ||
    local.saved.length > 0 ||
    local.interests.length > 0 ||
    local.hidden.length > 0 ||
    local.collections.length > 0 ||
    local.alerts.length > 0
  );
}

/**
 * O que sai do navegador na migração: só os grupos marcados (gate P2, I3). O resto vai vazio.
 * - buscas nunca vão; o e-mail dos alertas também não (o alerta da conta usa o e-mail da conta);
 * - `anonId` e histórico só com "Histórico" marcado (o texto da caixa avisa do vínculo).
 * `createdAt` vai fixo para não carregar a data de criação do perfil local.
 */
export function migrationPayload(local: AnonProfile, choice: MigrationChoice): AnonProfile {
  return {
    anonId: choice.history ? local.anonId : null,
    createdAt: "1970-01-01T00:00:00.000Z",
    follows: choice.follows ? local.follows.map(({ kind, id, at }) => ({ kind, id, at })) : [],
    alerts: choice.follows
      ? local.alerts
          .filter((a) => a.status === "active")
          .map((a) => ({
            id: a.id,
            kind: a.kind,
            target: a.target,
            label: a.label,
            frequency: a.frequency,
            channel: a.channel,
            status: a.status,
            at: a.at,
          }))
      : [],
    saved: choice.saved ? local.saved.map(({ ref, at, progress }) => ({ ref, at, progress })) : [],
    collections: choice.saved ? local.collections : [],
    interests: choice.interests ? local.interests : [],
    hidden: choice.interests ? local.hidden : [],
    history: choice.history ? local.history : [],
    searches: [],
  };
}

const alertKey = (a: { kind: string; target: string; channel: string }) =>
  `${a.kind}|${a.target}|${a.channel}`;

export function planMigration(
  local: AnonProfile,
  remote: RemoteAccountData,
  choice: MigrationChoice,
): MigrationPlan {
  const localSources = choice.follows
    ? [...new Set(local.follows.filter((f) => f.kind === "source").map((f) => f.id))]
    : [];
  const remoteSources = new Set(remote.follows);

  const remoteOther = new Set((remote.otherFollows ?? []).map((f) => `${f.kind}|${f.id}`));
  const otherFollows = choice.follows
    ? local.follows
        .filter((f) => f.kind !== "source" && !remoteOther.has(`${f.kind}|${f.id}`))
        .map(({ kind, id }) => ({ kind, id }))
    : [];

  const remoteAlerts = new Set((remote.alerts ?? []).map(alertKey));
  const alerts = choice.follows
    ? local.alerts.filter((a) => a.status === "active" && !remoteAlerts.has(alertKey(a)))
    : [];

  const localSaved = choice.saved ? local.saved : [];
  const remoteSaved = new Set(remote.saved);
  const remoteCollections = new Set((remote.collections ?? []).map((n) => n.trim().toLowerCase()));
  const collections = choice.saved
    ? local.collections
        .filter((c) => !remoteCollections.has(c.name.trim().toLowerCase()))
        .map((c) => ({ name: c.name, items: c.items }))
    : [];

  return {
    follows: localSources.filter((s) => !remoteSources.has(s)),
    saved: localSaved
      .filter((s) => !remoteSaved.has(s.ref))
      .map((s) => ({ ref: s.ref, progress: s.progress })),
    interests: choice.interests ? local.interests.map((i) => i.key) : [],
    history: choice.history ? local.history.length : 0,
    summary: migrationSummary(localSources.length, localSaved.length),
    otherFollows,
    alerts,
    collections,
    hidden: choice.interests
      ? local.hidden.map(({ sourceSlug, reason }) => ({ sourceSlug, reason }))
      : [],
  };
}
