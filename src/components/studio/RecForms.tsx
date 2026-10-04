"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { AUDIENCE_TEXT, REC_TEXT as T } from "@/content/pt-BR/recommendation-admin";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";
import { TextField } from "../ui/TextField";
import type { RecReply } from "./WeightSliders";

const Status = ({ status }: { status: RecReply | null }) => (
  <p
    role={status && !status.ok ? "alert" : "status"}
    aria-live="polite"
    className="min-h-6 type-body empty:hidden"
  >
    {status && (
      <span
        className={cx("inline-flex items-start gap-2", status.ok ? "text-service" : "text-danger")}
      >
        <Icon name={status.ok ? "check" : "circle-alert"} size={20} className="mt-0.5" />
        {status.message}
      </span>
    )}
  </p>
);

export interface CampaignFormProps {
  sources: { id: string; name: string }[];
  create: (i: {
    name: string;
    sourceIds: string[];
    startsOn: string;
    endsOn: string;
    quota: number;
    audience: string;
  }) => Promise<RecReply>;
  className?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Nova campanha de descoberta (O17): fontes, período, cota por bloco e público. */
export function CampaignForm({ sources, create, className }: CampaignFormProps) {
  const uid = useId();
  const router = useRouter();
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState(today());
  const [quota, setQuota] = useState("1");
  const [audience, setAudience] = useState("all");
  const [status, setStatus] = useState<RecReply | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className={cx("flex flex-col gap-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (chosen.length === 0)
          return setStatus({ ok: false, message: T.campaignSourcesRequired });
        if (endsOn < startsOn) return setStatus({ ok: false, message: T.campaignPeriodInvalid });
        start(async () => {
          const r = await create({
            name: name.trim(),
            sourceIds: chosen,
            startsOn,
            endsOn,
            quota: Number(quota),
            audience,
          });
          setStatus(r);
          if (r.ok) {
            setName("");
            setChosen([]);
            router.refresh();
          }
        });
      }}
    >
      <TextField
        id={`${uid}-name`}
        label={T.campaignName}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={120}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="type-label text-strong">{T.campaignSources}</legend>
        <ul className="grid gap-1 md:grid-cols-2">
          {sources.map((s) => (
            <li key={s.id}>
              <label className="flex min-h-tap items-center gap-2.5 type-body text-strong">
                <input
                  type="checkbox"
                  checked={chosen.includes(s.id)}
                  onChange={(e) =>
                    setChosen((c) =>
                      e.target.checked ? [...c, s.id].slice(0, 20) : c.filter((x) => x !== s.id),
                    )
                  }
                  className="size-5 shrink-0 accent-(--action-primary)"
                />
                {s.name}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-start`} className="type-label text-strong">
            {T.campaignStart}
          </label>
          <input
            id={`${uid}-start`}
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className="border-control h-tap rounded-lg bg-input px-3 type-body text-strong"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-end`} className="type-label text-strong">
            {T.campaignEnd}
          </label>
          <input
            id={`${uid}-end`}
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className="border-control h-tap rounded-lg bg-input px-3 type-body text-strong"
          />
        </div>
        <Select
          id={`${uid}-quota`}
          name="quota"
          label={T.campaignQuota}
          options={["1", "2", "3"].map((v) => ({ value: v, label: v }))}
          value={quota}
          onChange={setQuota}
        />
        <Select
          id={`${uid}-audience`}
          name="audience"
          label={T.campaignAudience}
          options={Object.entries(AUDIENCE_TEXT).map(([value, label]) => ({ value, label }))}
          value={audience}
          onChange={setAudience}
        />
      </div>
      <div>
        <Button type="submit" size="md" icon="plus" disabled={busy}>
          {busy ? T.creating : T.createCampaign}
        </Button>
      </div>
      <Status status={status} />
    </form>
  );
}

export interface ExperimentFormProps {
  /** Versões de pesos aprovadas (elegíveis para variante). */
  versions: { version: string; active: boolean }[];
  create: (i: {
    name: string;
    variants: { name: string; weightsVersion: string }[];
    split: number[];
  }) => Promise<RecReply>;
  className?: string;
}

/** Novo teste A/B (O17): controle × variante com versões aprovadas e alocação do controle. */
export function ExperimentForm({ versions, create, className }: ExperimentFormProps) {
  const uid = useId();
  const router = useRouter();
  const active = versions.find((v) => v.active)?.version ?? versions[0]?.version ?? "";
  const [name, setName] = useState("");
  const [a, setA] = useState(active);
  const [b, setB] = useState(versions.find((v) => v.version !== active)?.version ?? "");
  const [split, setSplit] = useState("50");
  const [status, setStatus] = useState<RecReply | null>(null);
  const [busy, start] = useTransition();
  const options = versions.map((v) => ({
    value: v.version,
    label: v.active ? `${v.version} (ativa)` : v.version,
  }));
  return (
    <form
      className={cx("flex flex-col gap-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (!a || !b || a === b) return setStatus({ ok: false, message: T.experimentSameVersion });
        const pct = Math.min(99, Math.max(1, Number(split) || 50));
        start(async () => {
          const r = await create({
            name: name.trim(),
            variants: [
              { name: "controle", weightsVersion: a },
              { name: "variante-1", weightsVersion: b },
            ],
            split: [pct, 100 - pct],
          });
          setStatus(r);
          if (r.ok) {
            setName("");
            router.refresh();
          }
        });
      }}
    >
      <TextField
        id={`${uid}-name`}
        label={T.experimentName}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={120}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Select
          id={`${uid}-a`}
          name="controle"
          label={`${T.variantA} · ${T.variantVersion}`}
          options={options}
          value={a}
          onChange={setA}
        />
        <Select
          id={`${uid}-b`}
          name="variante"
          label={`${T.variantB} · ${T.variantVersion}`}
          options={options}
          value={b}
          onChange={setB}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-split`} className="type-label text-strong">
            {T.splitLabel}
          </label>
          <input
            id={`${uid}-split`}
            type="number"
            min={1}
            max={99}
            value={split}
            onChange={(e) => setSplit(e.target.value)}
            className="border-control h-tap rounded-lg bg-input px-3 type-body tabular-nums text-strong"
          />
        </div>
      </div>
      <div>
        <Button type="submit" size="md" icon="flask-conical" disabled={busy || versions.length < 2}>
          {busy ? T.creating : T.createExperiment}
        </Button>
        {versions.length < 2 && (
          <span className="ml-3 type-meta text-meta">{T.experimentNeedsApproved}</span>
        )}
      </div>
      <Status status={status} />
    </form>
  );
}
