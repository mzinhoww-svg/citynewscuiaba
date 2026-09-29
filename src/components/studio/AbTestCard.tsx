import Link from "next/link";
import { REC_TEXT as T } from "@/content/pt-BR/control-rec";
import { formatPercent } from "@/lib/format/number";

export interface AbTestCardProps {
  id: string;
  name: string;
  status: "draft" | "running" | "ended";
  variants: readonly { label: string; weightsVersion: string }[];
  split: readonly number[];
  winner: number | null;
}

const STATE = { draft: T.testDraft, running: T.testRunning, ended: T.testEnded } as const;

/** Cartão de um teste A/B: nome, situação e divisão; o cartão inteiro leva ao detalhe. */
export function AbTestCard({ id, name, status, variants, split, winner }: AbTestCardProps) {
  return (
    <Link
      href={`/estudio/control/recomendacao/testes/${id}`}
      aria-label={T.openLabel(name)}
      className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-4 hover:border-line-section"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="type-label text-16 text-strong">{name}</span>
        <span className="type-meta font-semibold text-strong">{STATE[status]}</span>
      </span>
      <ul className="flex flex-col gap-1">
        {variants.map((v, i) => (
          <li key={`${v.weightsVersion}-${i}`} className="type-meta text-body">
            {T.variantLabel(i, i === 0)} · {T.weightsVersion(v.weightsVersion)} ·{" "}
            {formatPercent(split[i] ?? 0)}
            {winner === i ? ` · ${T.colWinner}` : ""}
          </li>
        ))}
      </ul>
    </Link>
  );
}
