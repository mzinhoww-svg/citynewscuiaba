"use client";

import { useId, useState, useTransition } from "react";
import { AI_ADMIN_TEXT as T, agentLabel, PROMPT_STATUS_LABEL } from "@/content/pt-BR/control-ai";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { Select } from "../ui/Select";

export interface PlaygroundAgentOption {
  id: string;
  versions: { version: number; status: string }[];
  /** Versão em produção (seleção inicial). */
  production: number | null;
}

export interface PlaygroundModelOption {
  id: string;
  name: string;
}

export type PlaygroundReply =
  | {
      ok: true;
      provider: "fake" | "openrouter";
      sanitizedInput: string;
      /** Saída em texto (JSON formatado, ou o texto cru quando fora do schema). */
      output: string;
      valid: boolean;
      costBrl: number;
      latencyMs: number;
    }
  | {
      ok: false;
      message: string;
      sanitizedInput: string | null;
      costBrl: number;
      latencyMs: number;
    };

export interface PlaygroundFormProps {
  agents: PlaygroundAgentOption[];
  models: PlaygroundModelOption[];
  run: (input: {
    agentId: string;
    promptVersion: number;
    modelId: string;
    input: string;
  }) => Promise<PlaygroundReply>;
}

/**
 * Playground (O15): escolhe agente, versão do prompt e modelo, cola um item de teste e mostra
 * a entrada sanitizada, a saída, a validade no schema, o custo e a latência. Texto de saída
 * sempre como texto (nunca HTML).
 */
export function PlaygroundForm({ agents, models, run }: PlaygroundFormProps) {
  const uid = useId();
  const first = agents[0];
  const [agentId, setAgentId] = useState(first?.id ?? "");
  const agent = agents.find((a) => a.id === agentId);
  const [version, setVersion] = useState(
    String(first?.production ?? first?.versions[0]?.version ?? ""),
  );
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<PlaygroundReply | null>(null);
  const [pending, startTransition] = useTransition();

  const onAgent = (id: string) => {
    setAgentId(id);
    const a = agents.find((x) => x.id === id);
    setVersion(String(a?.production ?? a?.versions[0]?.version ?? ""));
  };
  const ready =
    agent !== undefined && version !== "" && modelId !== "" && input.trim() !== "" && !pending;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          setResult(null);
          startTransition(async () => {
            setResult(await run({ agentId, promptVersion: Number(version), modelId, input }));
          });
        }}
      >
        <Select
          id={`${uid}-agent`}
          name="agent"
          label={T.testAgent}
          value={agentId}
          onChange={onAgent}
          options={agents.map((a) => ({ value: a.id, label: `${agentLabel(a.id)} (${a.id})` }))}
        />
        <Select
          id={`${uid}-version`}
          name="version"
          label={T.testPrompt}
          value={version}
          onChange={setVersion}
          hint={agent && agent.versions.length === 0 ? T.noPromptVersions : undefined}
          options={(agent?.versions ?? []).map((v) => ({
            value: String(v.version),
            label: T.testPromptOption(v.version, PROMPT_STATUS_LABEL[v.status] ?? v.status),
          }))}
        />
        <Select
          id={`${uid}-model`}
          name="model"
          label={T.testModel}
          value={modelId}
          onChange={setModelId}
          hint={models.length === 0 ? T.noActiveModels : undefined}
          options={models.map((m) => ({ value: m.id, label: m.name }))}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-input`} className="type-label text-16 text-strong">
            {T.testInput}
          </label>
          <textarea
            id={`${uid}-input`}
            rows={9}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-describedby={`${uid}-input-hint`}
            className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
          />
          <p id={`${uid}-input-hint`} className="type-meta text-meta">
            {T.testInputHint}
          </p>
        </div>
        <div>
          <Button type="submit" size="md" icon="play" disabled={!ready}>
            {pending ? T.testRunning : T.testRun}
          </Button>
        </div>
      </form>

      <section
        aria-labelledby={`${uid}-result`}
        aria-busy={pending || undefined}
        className="flex flex-col gap-4"
      >
        <h2 id={`${uid}-result`} className="type-section text-strong">
          {T.resultTitle}
        </h2>
        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          {pending && <p className="type-body text-meta">{T.testRunning}</p>}
          {!pending && result === null && <p className="type-body text-meta">{T.resultEmpty}</p>}
          {result && !result.ok && (
            <InlineAlert tone="error" title={T.resultFailed} role="none">
              {result.message}
            </InlineAlert>
          )}
          {result && (
            <>
              {result.sanitizedInput !== null && (
                <div className="flex flex-col gap-1">
                  <h3 className="type-label text-16 text-strong">{T.resultInputTitle}</h3>
                  <pre className="max-h-[16rem] overflow-auto whitespace-pre-wrap rounded-lg border border-line-subtle bg-card-white p-3 type-meta text-body">
                    {result.sanitizedInput}
                  </pre>
                </div>
              )}
              {result.ok && (
                <>
                  <p className="type-body font-semibold text-strong">
                    {result.valid ? T.resultValid : T.resultInvalid}
                  </p>
                  <div className="flex flex-col gap-1">
                    <h3 className="type-label text-16 text-strong">{T.resultOutputTitle}</h3>
                    <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap rounded-lg border border-line-subtle bg-card-white p-3 type-meta text-body">
                      {result.output}
                    </pre>
                  </div>
                </>
              )}
              <dl className="grid grid-cols-3 gap-3 rounded-lg border border-line-subtle bg-card-white p-3">
                <div>
                  <dt className="type-meta text-meta">{T.resultCost}</dt>
                  <dd className="type-body font-semibold tabular-nums text-strong">
                    {T.brl(result.costBrl)}
                  </dd>
                </div>
                <div>
                  <dt className="type-meta text-meta">{T.resultLatency}</dt>
                  <dd className="type-body font-semibold tabular-nums text-strong">
                    {T.ms(result.latencyMs)}
                  </dd>
                </div>
                {result.ok && (
                  <div>
                    <dt className="type-meta text-meta">{T.resultProvider}</dt>
                    <dd className="type-body font-semibold text-strong">
                      {result.provider === "fake" ? T.providerFake : T.providerReal}
                    </dd>
                  </div>
                )}
              </dl>
              <p className="type-meta text-meta">{T.resultBudgetNote}</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
