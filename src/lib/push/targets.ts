/**
 * Alvos da inscrição a partir das escolhas explícitas do leitor (D-P12): seguidas de fonte,
 * editoria e assunto, e alertas ativos de canal navegador (bairro, tema, assunto). Nunca
 * histórico, interesses, coleções, agenda, urgentes ou `anonId`.
 */
import type { AnonProfile } from "@/lib/anon/types";
import type { TargetKey } from "./types";

export const TARGET_RE = /^(source|section|topic|bairro):[a-z0-9-]{1,80}$/;
export const MAX_TARGETS = 200;

export function isTargetKey(s: string): s is TargetKey {
  return TARGET_RE.test(s);
}

export function targetsFromProfile(p: Pick<AnonProfile, "follows" | "alerts">): TargetKey[] {
  const out: TargetKey[] = [];
  const add = (t: string) => {
    if (isTargetKey(t) && !out.includes(t) && out.length < MAX_TARGETS) out.push(t);
  };
  for (const f of p.follows) {
    if (f.kind === "source") add(`source:${f.id}`);
    else if (f.kind === "section") add(`section:${f.id}`);
    else if (f.kind === "topic") add(`topic:${f.id}`);
  }
  for (const a of p.alerts) {
    if (a.channel !== "browser" || a.status !== "active") continue;
    if (a.kind === "bairro") add(`bairro:${a.target}`);
    else if (a.kind === "tema") add(`section:${a.target}`);
    else if (a.kind === "assunto") add(`topic:${a.target}`);
  }
  return out;
}
