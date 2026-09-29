"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { REC_TEXT as T } from "@/content/pt-BR/control-rec";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";

export interface ExperimentFormProps {
  /** Versões de pesos que podem entrar numa variante. */
  versions: readonly string[];
  create: (input: {
    name: string;
    hypothesis?: string;
    variants: { label: string; weightsVersion: string }[];
    split: number[];
  }) => Promise<{ ok: boolean; message: string; value?: { id: string } }>;
}

const field = "border-control h-tap rounded-lg bg-input px-4 type-body text-strong";

/** Novo teste A/B (O18): nome, variantes (uma versão de pesos cada) e divisão em porcentagem. */
export function ExperimentForm({ versions, create }: ExperimentFormProps) {
  const uid = useId();
  const router = useRouter();
  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [rows, setRows] = useState<{ version: string; pct: number }[]>([
    { version: versions[0] ?? "", pct: 50 },
    { version: versions[1] ?? versions[0] ?? "", pct: 50 },
  ]);
  const [reply, setReply] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const sum = rows.reduce((a, r) => a + r.pct, 0);
  const splitOk = sum === 100 && rows.every((r) => r.pct > 0);
  const distinct = new Set(rows.map((r) => r.version)).size === rows.length;
  const canSave = splitOk && distinct && name.trim().length >= 3 && !pending;

  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    start(async () => {
      const r = await create({
        name,
        ...(hypothesis.trim() ? { hypothesis } : {}),
        variants: rows.map((row, i) => ({
          label: i === 0 ? T.variantLabel(0, true) : T.variantLabel(i, false),
          weightsVersion: row.version,
        })),
        split: rows.map((row) => row.pct / 100),
      });
      setReply(r);
      if (r.ok && r.value) router.push(`/estudio/control/recomendacao/testes/${r.value.id}`);
    });
  }

  if (versions.length < 2) return <p className="type-body text-meta">{T.testVariantsInvalid}</p>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={pending}>
      <h3 className="type-label text-16 text-strong">{T.newTest}</h3>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-n`} className="type-label text-16 text-strong">
          {T.testName}
        </label>
        <input
          id={`${uid}-n`}
          className={field}
          value={name}
          maxLength={120}
          required
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-h`} className="type-label text-16 text-strong">
          {T.testHypothesis}
        </label>
        <textarea
          id={`${uid}-h`}
          rows={2}
          maxLength={500}
          value={hypothesis}
          onChange={(e) => setHypothesis(e.target.value)}
          className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
        />
      </div>
      <ul className="flex flex-col gap-4">
        {rows.map((r, i) => (
          <li key={i} className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${uid}-v${i}`} className="type-label text-16 text-strong">
                {T.testVariant(i + 1)}
              </label>
              <select
                id={`${uid}-v${i}`}
                className={field}
                value={r.version}
                onChange={(e) => setRow(i, { version: e.target.value })}
              >
                {versions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${uid}-p${i}`} className="type-label text-16 text-strong">
                {T.testSplit(i + 1)}
              </label>
              <input
                id={`${uid}-p${i}`}
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                className={field}
                value={r.pct}
                onChange={(e) => setRow(i, { pct: Math.round(Number(e.target.value)) || 0 })}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={rows.length >= Math.min(6, versions.length)}
          onClick={() =>
            setRows((rs) => [
              ...rs,
              {
                version: versions.find((v) => !rs.some((r) => r.version === v)) ?? versions[0]!,
                pct: 0,
              },
            ])
          }
        >
          {T.addVariant}
        </Button>
        <Button
          variant="text"
          size="sm"
          disabled={rows.length <= 2}
          onClick={() => setRows((rs) => rs.slice(0, -1))}
        >
          {T.removeVariant}
        </Button>
        <p
          role="status"
          aria-live="polite"
          className={`type-body font-semibold ${splitOk ? "text-service" : "text-danger"}`}
        >
          {splitOk ? T.testSplitOk : T.testSplitSum(sum)}
        </p>
      </div>
      {!distinct && <p className="type-meta text-danger">{T.testVariantsInvalid}</p>}
      {reply && (
        <InlineAlert tone={reply.ok ? "success" : "error"} role={reply.ok ? "status" : "alert"}>
          {reply.message}
        </InlineAlert>
      )}
      <div>
        <Button type="submit" variant="primary" size="md" disabled={!canSave}>
          {T.testCreate}
        </Button>
      </div>
    </form>
  );
}
