"use client";

import { useId, useState, useTransition } from "react";
import { REC_TEXT as T, WEIGHT_LABEL } from "@/content/pt-BR/control-rec";
import { formatDecimal2 } from "@/lib/format/number";
import { WEIGHT_KEYS, type ScoreComponent } from "@/lib/ranking";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";

export interface WhyRowView {
  position: number;
  slug: string;
  name: string;
  score: number;
  reason: string;
  discovery: boolean;
  components: ScoreComponent[];
}

export interface WhyResultView {
  alias: string;
  personalization: boolean;
  version: string;
  rows: WhyRowView[];
}

export type WhyReply =
  { ok: true; message: string; value: WhyResultView } | { ok: false; message: string };

export interface WhyThisDrawerProps {
  explain: (anonId: string) => Promise<WhyReply>;
}

/**
 * "Por que esta recomendação" (O17): mostra os componentes do score de cada fonte para um id
 * anônimo. O id fica só no campo (nunca em URL nem no resultado): a tela mostra o apelido.
 * Sem Personalização o componente individual vale 0.
 */
export function WhyThisDrawer({ explain }: WhyThisDrawerProps) {
  const uid = useId();
  const [anon, setAnon] = useState("");
  const [result, setResult] = useState<WhyResultView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await explain(anon);
      if (r.ok) {
        setResult(r.value);
        setAnon("");
      } else {
        setResult(null);
        setError(r.message);
      }
    });
  }

  return (
    <details className="rounded-lg border border-line-subtle bg-card-white">
      <summary className="min-h-tap cursor-pointer px-4 py-3 type-label text-16 text-strong">
        {T.whyTitle}
      </summary>
      <div className="flex flex-col gap-4 border-t border-line-subtle p-4">
        <p className="type-body text-meta">{T.whyIntro}</p>
        <form onSubmit={submit} className="flex flex-col gap-2" aria-busy={pending}>
          <label htmlFor={`${uid}-anon`} className="type-label text-16 text-strong">
            {T.whyLabel}
          </label>
          <input
            id={`${uid}-anon`}
            name="anon"
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            value={anon}
            onChange={(e) => setAnon(e.target.value)}
            aria-describedby={`${uid}-hint`}
            className="border-control h-tap rounded-lg bg-input px-4 type-body text-strong"
          />
          <p id={`${uid}-hint`} className="type-meta text-meta">
            {T.whyHint}
          </p>
          <div>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={pending || anon.trim() === ""}
            >
              {pending ? T.whyWorking : T.whyButton}
            </Button>
          </div>
        </form>

        {error && (
          <InlineAlert tone="error" role="alert">
            {error}
          </InlineAlert>
        )}

        {result && (
          <section aria-labelledby={`${uid}-res`} className="flex flex-col gap-3">
            <h3 id={`${uid}-res`} className="type-label text-16 text-strong">
              {T.whyResultTitle(result.alias)}
            </h3>
            <p className="type-body text-body">
              {result.personalization ? T.whyConsent : T.whyNoConsent}
            </p>
            <p className="type-meta text-meta">{T.whyVersion(result.version)}</p>
            {result.rows.length === 0 ? (
              <p className="type-body text-meta">{T.whyEmpty}</p>
            ) : (
              <div
                role="region"
                aria-label={T.whyCaption(result.alias)}
                tabIndex={0}
                className="overflow-x-auto rounded-lg border border-line-subtle"
              >
                <table className="w-full min-w-[56rem] border-collapse text-left">
                  <caption className="sr-only">{T.whyCaption(result.alias)}</caption>
                  <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                    <tr>
                      <th scope="col" className="px-3 py-3">
                        {T.colPosition}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.colSource}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.colScore}
                      </th>
                      {WEIGHT_KEYS.map((k) => (
                        <th key={k} scope="col" className="px-3 py-3">
                          {WEIGHT_LABEL[k]}
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-3">
                        {T.colDiscovery}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.colWhy}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={r.slug} className="border-b border-line-subtle last:border-b-0">
                        <td className="px-3 py-3 type-body tabular-nums">{r.position}</td>
                        <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                          {r.name}
                        </th>
                        <td className="px-3 py-3 type-body tabular-nums">
                          {formatDecimal2(r.score)}
                        </td>
                        {r.components.map((c) => (
                          <td key={c.key} className="px-3 py-3 type-body tabular-nums">
                            {T.componentCell(formatDecimal2(c.value), formatDecimal2(c.weight))}
                          </td>
                        ))}
                        <td className="px-3 py-3 type-body">{r.discovery ? T.yes : T.no}</td>
                        <td className="px-3 py-3 type-body">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="type-meta text-meta">{T.componentNote}</p>
            <div>
              <Button variant="text" size="sm" onClick={() => setResult(null)}>
                {T.close}
              </Button>
            </div>
          </section>
        )}
      </div>
    </details>
  );
}
