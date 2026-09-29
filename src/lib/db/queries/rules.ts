import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Candidate, RuleSet } from "@/lib/rules";
import { parseRuleRow } from "@/lib/rules/load";
import { studioContext } from "@/lib/studio/context";

/*
 * Leituras da tela de regras de autonomia (O05, P5-T2) com a sessão da pessoa: versões de
 * `rules` (staff lê todas) e a amostra dos últimos dias para a simulação (candidatos que a
 * etapa 15 registrou em `decisions.output.candidate`).
 */

export interface RuleVersion {
  version: number;
  active: boolean;
  forceReview: boolean;
  proposedBy: { id: string; name: string | null };
  approvedBy: { id: string; name: string | null } | null;
  createdAt: string;
  /** `null` quando o corpo não passa na validação (nunca vira regra ativa: falha fechada). */
  rules: RuleSet | null;
}

export interface RulesOverview {
  active: RuleVersion | null;
  /** Propostas sem decisão (inativas e sem aprovador), mais recentes primeiro. */
  proposals: RuleVersion[];
  versions: RuleVersion[];
}

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`rules ${what}: ${error.message}`);
}

async function names(db: DbClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const uuids = [...new Set(ids.filter((i): i is string => Boolean(i)))];
  if (uuids.length === 0) return new Map();
  const { data, error } = await db.from("profiles").select("id, display_name").in("id", uuids);
  check("profiles", error);
  return new Map((data ?? []).map((r) => [r.id, r.display_name]));
}

export async function rulesOverview(db?: DbClient): Promise<RulesOverview> {
  const client = db ?? (await studioContext()).db;
  const { data, error } = await client
    .from("rules")
    .select("version, body, force_review, proposed_by, approved_by, active, created_at")
    .order("version", { ascending: false })
    .limit(50);
  check("versions", error);
  const rows = data ?? [];
  const people = await names(
    client,
    rows.flatMap((r) => [r.proposed_by, r.approved_by]),
  );
  const versions: RuleVersion[] = rows.map((r) => {
    const parsed = parseRuleRow(r);
    return {
      version: r.version,
      active: r.active,
      forceReview: r.force_review,
      proposedBy: { id: r.proposed_by, name: people.get(r.proposed_by) ?? null },
      approvedBy: r.approved_by
        ? { id: r.approved_by, name: people.get(r.approved_by) ?? null }
        : null,
      createdAt: r.created_at,
      rules: parsed.ok ? parsed.value : null,
    };
  });
  return {
    active: versions.find((v) => v.active) ?? null,
    proposals: versions.filter((v) => !v.active && v.approvedBy === null),
    versions,
  };
}

const isCandidate = (v: unknown): v is Candidate => {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.category === "string" &&
    Array.isArray(c.tags) &&
    typeof c.independentSources === "number" &&
    typeof c.primarySources === "number" &&
    typeof c.confidenceScore === "number"
  );
};

/** Candidatos decididos pelas regras nos últimos `days` dias (amostra da simulação). */
export async function recentCandidates(days = 7, db?: DbClient): Promise<Candidate[]> {
  const client = db ?? (await studioContext()).db;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await client
    .from("decisions")
    .select("output")
    .eq("step", "rules")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  check("decisions", error);
  return (data ?? []).flatMap((r) => {
    const c = (r.output as { candidate?: unknown } | null)?.candidate;
    return isCandidate(c) ? [c] : [];
  });
}

/** Próximo número de versão (o banco garante a unicidade; quem insere trata o conflito). */
export async function nextRuleVersion(db?: DbClient): Promise<number> {
  const client = db ?? (await studioContext()).db;
  const { data, error } = await client
    .from("rules")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  check("next", error);
  return (data?.version ?? 0) + 1;
}
