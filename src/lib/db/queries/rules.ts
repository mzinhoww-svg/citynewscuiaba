import "server-only";
import { z } from "zod";
import type { Candidate, RuleSet } from "@/lib/rules";
import { parseRuleRow } from "@/lib/rules/load";
import { studioContext } from "@/lib/studio/context";

/*
 * Leituras da tela de regras de autonomia (Control Center · Regras; P5-T2), com a sessão da
 * pessoa (RLS: só a equipe lê `rules`, `approvals` e `decisions`).
 */

export type RuleApprovalStatus = "pending" | "approved" | "rejected";

export interface RuleVersionRow {
  version: number;
  /** `null` quando o corpo não passa na validação (a versão nunca é usada). */
  rules: RuleSet | null;
  active: boolean;
  createdAt: string;
  proposedBy: string;
  proposerName: string | null;
  approvedBy: string | null;
  approverName: string | null;
  approvals: { id: string; kind: string; status: string }[];
}

const RULE_KINDS = ["rules.activate", "safety.disable", "force_review.disable"];

/** Versões de regras, da mais nova para a mais antiga (até 30), com os pedidos de aprovação. */
export async function listRuleVersions(): Promise<RuleVersionRow[]> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("rules")
    .select("version, body, force_review, active, created_at, proposed_by, approved_by")
    .order("version", { ascending: false })
    .limit(30);
  if (error) throw new Error(`regras: ${error.message}`);
  const rows = data ?? [];
  const refs = rows.map((r) => String(r.version));
  const [approvals, people] = await Promise.all([
    refs.length > 0
      ? db
          .from("approvals")
          .select("id, kind, target_ref, status, created_at")
          .in("kind", RULE_KINDS)
          .in("target_ref", refs)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    (async () => {
      const ids = [...new Set(rows.flatMap((r) => [r.proposed_by, r.approved_by ?? []].flat()))];
      if (ids.length === 0) return new Map<string, string>();
      const p = await db.from("profiles").select("id, display_name").in("id", ids);
      if (p.error) throw new Error(`regras (pessoas): ${p.error.message}`);
      return new Map((p.data ?? []).map((x) => [x.id, x.display_name]));
    })(),
  ]);
  if (approvals.error) throw new Error(`regras (aprovações): ${approvals.error.message}`);
  return rows.map((r) => {
    const parsed = parseRuleRow(r);
    return {
      version: r.version,
      rules: parsed.ok ? parsed.value : null,
      active: r.active,
      createdAt: r.created_at,
      proposedBy: r.proposed_by,
      proposerName: people.get(r.proposed_by) ?? null,
      approvedBy: r.approved_by,
      approverName: r.approved_by ? (people.get(r.approved_by) ?? null) : null,
      approvals: (approvals.data ?? [])
        .filter((a) => a.target_ref === String(r.version))
        .map((a) => ({ id: a.id, kind: a.kind, status: a.status })),
    };
  });
}

const CandidateSchema = z.object({
  category: z.string().max(80),
  tags: z.array(z.string().max(120)).max(50),
  independentSources: z.number(),
  primarySources: z.number(),
  centralConflict: z.boolean(),
  imageApproved: z.boolean(),
  confidenceScore: z.number(),
  breaking: z.boolean(),
  sensitive: z.boolean().optional(),
});

export const SIMULATION_DAYS = 7;
const SAMPLE_LIMIT = 2000;

/**
 * Candidatos reais dos últimos 7 dias: a decisão de regras mais recente de cada matéria
 * (`decisions.step = 'rules'`, com o candidato gravado pela etapa `decide`). Decisões sem
 * candidato (anteriores ao registro ou do seed) ficam de fora.
 */
export async function recentCandidates(now: Date): Promise<Candidate[]> {
  const { db } = await studioContext();
  const since = new Date(now.getTime() - SIMULATION_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("decisions")
    .select("object_ref, output, created_at")
    .eq("step", "rules")
    .gte("created_at", since)
    .not("output->candidate", "is", null)
    .order("created_at", { ascending: false })
    .limit(SAMPLE_LIMIT);
  if (error) throw new Error(`simulação: ${error.message}`);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.object_ref)) continue;
    seen.add(row.object_ref);
    const output = row.output;
    const raw =
      output && typeof output === "object" && !Array.isArray(output) ? output.candidate : null;
    const parsed = CandidateSchema.safeParse(raw);
    if (!parsed.success) continue;
    const { sensitive, ...rest } = parsed.data;
    out.push(sensitive === undefined ? rest : { ...rest, sensitive });
  }
  return out;
}
