import { diffWords } from "@/lib/diff/words";
import { docText } from "./doc";

/** Trecho de diff por palavra: igual, acrescentado ou removido. */
export type DiffOp = { op: "eq" | "add" | "del"; text: string };

/** Diferença por palavra (LCS de palavras e espaços; trechos vizinhos do mesmo tipo unidos). */
export function diffText(a: string, b: string): DiffOp[] {
  return diffWords(a, b).map((p) => ({ op: p.type === "same" ? "eq" : p.type, text: p.text }));
}

export interface VersionSnapshot {
  title?: unknown;
  dek?: unknown;
  body?: unknown;
}

export type VersionField = "title" | "dek" | "body";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Compara duas versões (snapshot de article_versions) por campo: título, linha fina e texto. */
export function versionDiff(
  a: VersionSnapshot,
  b: VersionSnapshot,
): { fields: Record<VersionField, DiffOp[]>; changed: VersionField[] } {
  const fields: Record<VersionField, DiffOp[]> = {
    title: diffText(str(a.title), str(b.title)),
    dek: diffText(str(a.dek), str(b.dek)),
    body: diffText(docText(a.body), docText(b.body)),
  };
  const changed = (["title", "dek", "body"] as const).filter((k) =>
    fields[k].some((o) => o.op !== "eq"),
  );
  return { fields, changed };
}
