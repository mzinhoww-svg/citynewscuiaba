"use client";

import { useId, useState, useTransition } from "react";
import { formatWeight, WEIGHT_TEXT, WHY_TEXT as T } from "@/content/pt-BR/recommendation-admin";
import type { WeightKey } from "@/lib/ranking/types";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/TextField";

export interface WhyComponent {
  key: WeightKey;
  weight: number;
  signal: number;
  contribution: number;
}

export interface WhyReply {
  ok: boolean;
  message: string;
  result?: {
    pseudonym: string;
    personalization: boolean;
    version: string;
    sources: {
      slug: string;
      name: string;
      score: number;
      reason: string;
      components: WhyComponent[];
    }[];
  };
}

export interface WhyThisDrawerProps {
  explain: (i: { anonId: string }) => Promise<WhyReply>;
  className?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dec2 = (n: number) => formatWeight(n);

/**
 * Explorador "Por que esta recomendação" (O17): recebe um anonId, mostra o leitor só pelo
 * pseudônimo e decompõe o score de cada fonte recomendada em peso × sinal. Sem consentimento,
 * o individual pesa 0. A consulta fica na auditoria.
 */
export function WhyThisDrawer({ explain, className }: WhyThisDrawerProps) {
  const uid = useId();
  const [anonId, setAnonId] = useState("");
  const [reply, setReply] = useState<WhyReply | null>(null);
  const [busy, start] = useTransition();
  const r = reply?.result;
  return (
    <section aria-labelledby={`${uid}-title`} className={cx("flex flex-col gap-4", className)}>
      <h2 id={`${uid}-title`} className="type-section text-strong">
        {T.title}
      </h2>
      <p className="type-body text-meta">{T.intro}</p>
      <form
        className="flex flex-col gap-3 md:flex-row md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!UUID.test(anonId.trim())) return setReply({ ok: false, message: T.anonIdInvalid });
          start(async () => setReply(await explain({ anonId: anonId.trim() })));
        }}
      >
        <TextField
          id={`${uid}-anon`}
          label={T.anonId}
          hint={T.anonIdHint}
          value={anonId}
          onChange={(e) => setAnonId(e.target.value)}
          className="md:flex-1"
        />
        <Button type="submit" size="md" icon="search" disabled={busy}>
          {busy ? T.explaining : T.explain}
        </Button>
      </form>
      <p className="type-meta text-meta">{T.audit}</p>
      <p
        role={reply && !reply.ok ? "alert" : "status"}
        aria-live="polite"
        className="min-h-6 type-body empty:hidden"
      >
        {reply && !reply.ok && (
          <span className="inline-flex items-start gap-2 text-danger">
            <Icon name="circle-alert" size={20} className="mt-0.5" />
            {reply.message}
          </span>
        )}
        {r && (
          <span className="text-strong">
            {T.pseudonym(r.pseudonym)} · {r.version}
          </span>
        )}
      </p>
      {r && (
        <>
          <p className="flex items-start gap-2 type-body text-body">
            <Icon
              name={r.personalization ? "check" : "eye-off"}
              size={18}
              className="mt-0.5 shrink-0"
            />
            {r.personalization ? T.consentYes : T.consentNo}
          </p>
          {r.sources.length === 0 ? (
            <p className="type-body text-meta">{T.empty}</p>
          ) : (
            <div
              role="region"
              aria-label={T.caption}
              tabIndex={0}
              className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
            >
              <table className="w-full min-w-[48rem] border-collapse text-left">
                <caption className="sr-only">{T.caption}</caption>
                <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                  <tr>
                    <th scope="col" className="px-3 py-3">
                      {T.col.source}
                    </th>
                    <th scope="col" className="px-3 py-3">
                      {T.col.score}
                    </th>
                    <th scope="col" className="px-3 py-3">
                      {T.col.reason}
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Componentes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.sources.map((s) => (
                    <tr
                      key={s.slug}
                      className="border-b border-line-subtle last:border-0 align-top"
                    >
                      <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                        {s.name}
                      </th>
                      <td className="px-3 py-3 type-body tabular-nums">{dec2(s.score)}</td>
                      <td className="px-3 py-3 type-body">{s.reason}</td>
                      <td className="px-3 py-3">
                        <ul className="flex flex-col gap-0.5 type-meta text-body">
                          {s.components.map((c) => (
                            <li key={c.key}>
                              {T.component(
                                WEIGHT_TEXT[c.key].label,
                                dec2(c.weight),
                                dec2(c.signal),
                              )}{" "}
                              ={" "}
                              <span className="font-semibold tabular-nums text-strong">
                                {dec2(c.contribution)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
