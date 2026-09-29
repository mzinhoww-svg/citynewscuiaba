"use client";

import { useId, useState, useTransition } from "react";
import { REC_TEXT as T } from "@/content/pt-BR/control-rec";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";

export interface CampaignFormProps {
  create: (input: {
    name: string;
    sourceSlugs: string[];
    startsOn: string;
    endsOn: string;
    quotaPct: number;
    audience: "todos" | "anonimos" | "contas";
  }) => Promise<{ ok: boolean; message: string }>;
  /** Hoje (AAAA-MM-DD, fuso de Cuiabá): início padrão. */
  today: string;
}

const field = "border-control h-tap rounded-lg bg-input px-4 type-body text-strong";

/** Nova campanha de descoberta (O17): fontes, período, cota e público. */
export function CampaignForm({ create, today }: CampaignFormProps) {
  const uid = useId();
  const [name, setName] = useState("");
  const [slugs, setSlugs] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [quota, setQuota] = useState(10);
  const [audience, setAudience] = useState<"todos" | "anonimos" | "contas">("todos");
  const [reply, setReply] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startT] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const list = slugs
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    startT(async () => {
      const r = await create({
        name,
        sourceSlugs: list,
        startsOn: start,
        endsOn: end,
        quotaPct: quota,
        audience,
      });
      setReply(r);
      if (r.ok) {
        setName("");
        setSlugs("");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={pending}>
      <h3 className="type-label text-16 text-strong">{T.newCampaign}</h3>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-n`} className="type-label text-16 text-strong">
          {T.campName}
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
        <label htmlFor={`${uid}-s`} className="type-label text-16 text-strong">
          {T.campSources}
        </label>
        <textarea
          id={`${uid}-s`}
          rows={3}
          value={slugs}
          required
          onChange={(e) => setSlugs(e.target.value)}
          aria-describedby={`${uid}-s-h`}
          className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
        />
        <p id={`${uid}-s-h`} className="type-meta text-meta">
          {T.campSourcesHint}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-a`} className="type-label text-16 text-strong">
            {T.campStart}
          </label>
          <input
            id={`${uid}-a`}
            type="date"
            className={field}
            value={start}
            required
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-b`} className="type-label text-16 text-strong">
            {T.campEnd}
          </label>
          <input
            id={`${uid}-b`}
            type="date"
            className={field}
            value={end}
            required
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-q`} className="type-label text-16 text-strong">
            {T.campQuota}
          </label>
          <input
            id={`${uid}-q`}
            type="number"
            min={1}
            max={20}
            inputMode="numeric"
            className={field}
            value={quota}
            required
            onChange={(e) => setQuota(Math.round(Number(e.target.value)) || 1)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-p`} className="type-label text-16 text-strong">
            {T.campAudience}
          </label>
          <select
            id={`${uid}-p`}
            className={field}
            value={audience}
            onChange={(e) => setAudience(e.target.value as typeof audience)}
          >
            {(Object.keys(T.audience) as (keyof typeof T.audience)[]).map((k) => (
              <option key={k} value={k}>
                {T.audience[k]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {reply && (
        <InlineAlert tone={reply.ok ? "success" : "error"} role={reply.ok ? "status" : "alert"}>
          {reply.message}
        </InlineAlert>
      )}
      <div>
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {T.campCreate}
        </Button>
      </div>
    </form>
  );
}

export interface EndCampaignButtonProps {
  id: string;
  name: string;
  end: (input: { id: string }) => Promise<{ ok: boolean; message: string }>;
}

/** "Encerrar" uma campanha, com o nome dela no rótulo. */
export function EndCampaignButton({ id, name, end }: EndCampaignButtonProps) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        aria-label={T.campEndLabel(name)}
        disabled={pending}
        onClick={() => start(async () => setMsg((await end({ id })).message))}
      >
        {T.campEnd_}
      </Button>
      {msg && (
        <span role="status" className="type-meta text-meta">
          {msg}
        </span>
      )}
    </span>
  );
}
