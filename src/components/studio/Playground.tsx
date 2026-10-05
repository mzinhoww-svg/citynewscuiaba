"use client";

import { useId, useState, useTransition } from "react";
import { AI_ERROR_TEXT, PLAYGROUND_TEXT as T, formatBrlPrecise } from "@/content/pt-BR/ai-prompts";
import { agentName } from "@/content/pt-BR/ai-control";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Panel } from "../ui/Panel";
import { Select } from "../ui/Select";
import { StatGrid } from "../ui/StatGrid";
import { TextArea } from "../ui/TextArea";

export interface PlaygroundAgentOption {
  id: string;
  versions: { version: number; label: string }[];
  defaultVersion: number | null;
  cases: { id: string; key: string; question: string; sources: { id: string; text: string }[] }[];
}

export interface PlaygroundReply {
  ok: boolean;
  message: string;
  result?: {
    sanitizedInput: { id: string; text: string; injection: boolean }[];
    output: unknown;
    valid: boolean;
    error: string | null;
    costBrl: number;
    latencyMs: number;
    providerKind: string;
    promptVersion: number | null;
    modelId: string;
  };
}

export interface PlaygroundProps {
  agents: PlaygroundAgentOption[];
  models: { id: string; name: string; active: boolean }[];
  providerKind: "fake" | "openrouter";
  run: (i: {
    agentId: string;
    promptVersion?: number;
    modelId?: string;
    task: string;
    data: { id: string; text: string }[];
  }) => Promise<PlaygroundReply>;
  className?: string;
}

/**
 * Playground (O15): escolher agente, versão do prompt e modelo; colar item ou escolher caso da
 * regressão; ver entrada sanitizada, saída estruturada, validação, custo e latência.
 */
export function Playground({ agents, models, providerKind, run, className }: PlaygroundProps) {
  const uid = useId();
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "classify");
  const agent = agents.find((a) => a.id === agentId) ?? agents[0];
  const [version, setVersion] = useState(agent?.defaultVersion ? String(agent.defaultVersion) : "");
  const [modelId, setModelId] = useState("");
  const [task, setTask] = useState(T.defaultTask[agentId] ?? "");
  const [text, setText] = useState("");
  const [caseId, setCaseId] = useState("");
  const [reply, setReply] = useState<PlaygroundReply | null>(null);
  const [busy, start] = useTransition();

  const pickAgent = (id: string) => {
    setAgentId(id);
    const a = agents.find((x) => x.id === id);
    setVersion(a?.defaultVersion ? String(a.defaultVersion) : "");
    setTask(T.defaultTask[id] ?? "");
    setCaseId("");
    setReply(null);
  };
  const chosenCase = agent?.cases.find((c) => c.id === caseId) ?? null;

  return (
    <div className={cx("flex flex-col gap-6", className)}>
      <p className="flex items-start gap-2 type-meta text-meta">
        <Icon name="info" size={16} className="mt-0.5 shrink-0" />
        {providerKind === "fake" ? T.fake : T.real}
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const data = chosenCase
            ? chosenCase.sources
            : text.trim()
              ? [{ id: "item-1", text: text.trim() }]
              : [];
          const finalTask = chosenCase ? `${task}\n\nPergunta: ${chosenCase.question}` : task;
          if (data.length === 0) return setReply({ ok: false, message: T.dataRequired });
          if (!finalTask.trim()) return setReply({ ok: false, message: T.taskRequired });
          start(async () => {
            setReply(
              await run({
                agentId,
                ...(version ? { promptVersion: Number(version) } : {}),
                ...(modelId ? { modelId } : {}),
                task: finalTask,
                data,
              }),
            );
          });
        }}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Select
            id={`${uid}-agent`}
            name="agente"
            label={T.agent}
            options={agents.map((a) => ({ value: a.id, label: agentName(a.id) }))}
            value={agentId}
            onChange={pickAgent}
          />
          <Select
            id={`${uid}-version`}
            name="versao"
            label={T.promptVersion}
            options={(agent?.versions ?? []).map((v) => ({
              value: String(v.version),
              label: v.label,
            }))}
            value={version}
            onChange={setVersion}
          />
          <Select
            id={`${uid}-model`}
            name="modelo"
            label={T.model}
            placeholder={T.modelDefault}
            options={models.filter((m) => m.active).map((m) => ({ value: m.id, label: m.name }))}
            value={modelId}
            onChange={setModelId}
          />
        </div>
        <TextArea
          id={`${uid}-task`}
          name="tarefa"
          label={T.task}
          rows={2}
          value={task}
          onChange={setTask}
          hint={T.taskHint}
        />
        {agent && agent.cases.length > 0 && (
          <Select
            id={`${uid}-case`}
            name="caso"
            label={T.caseLabel}
            placeholder={T.caseNone}
            options={agent.cases.map((c) => ({ value: c.id, label: `${c.key} · ${c.question}` }))}
            value={caseId}
            onChange={setCaseId}
          />
        )}
        <TextArea
          id={`${uid}-data`}
          name="dados"
          label={T.data}
          rows={6}
          value={text}
          disabled={chosenCase !== null}
          onChange={setText}
          hint={T.dataHint}
        />
        <div>
          <Button type="submit" size="md" icon="play" disabled={busy}>
            {busy ? T.running : T.run}
          </Button>
        </div>
      </form>

      <p
        role={reply && !reply.ok ? "alert" : "status"}
        aria-live="polite"
        className="min-h-6 type-body empty:hidden"
      >
        {reply && (
          <span
            className={cx(
              "inline-flex items-start gap-2",
              reply.ok ? "text-service" : "text-danger",
            )}
          >
            <Icon name={reply.ok ? "check" : "circle-alert"} size={20} className="mt-0.5" />
            {reply.message}
          </span>
        )}
      </p>

      {reply?.result && (
        <section aria-label={T.resultTitle} className="flex flex-col gap-4">
          <h2 className="type-section text-strong">{T.resultTitle}</h2>
          <StatGrid
            aria-label={T.resultTitle}
            columns={4}
            items={[
              [
                reply.result.valid ? T.valid : T.invalid,
                reply.result.error
                  ? (AI_ERROR_TEXT[reply.result.error] ?? reply.result.error)
                  : "ok",
              ],
              [T.cost, formatBrlPrecise(reply.result.costBrl)],
              [T.latency, `${reply.result.latencyMs} ms`],
              [T.model, reply.result.modelId],
            ].map(([k, v]) => ({ label: k!, value: v }))}
          />
          <h3 className="type-label text-strong">{T.sanitized}</h3>
          <ul className="flex flex-col gap-2">
            {reply.result.sanitizedInput.map((d) => (
              <li key={d.id}>
                <Panel as="div" pad="sm">
                  <p className="type-meta text-meta">
                    {d.id}
                    {d.injection && (
                      <span className="ml-2 font-semibold text-danger">· {T.injection}</span>
                    )}
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap break-words type-body text-body">
                    {d.text}
                  </pre>
                </Panel>
              </li>
            ))}
          </ul>
          <h3 className="type-label text-strong">{T.output}</h3>
          <pre className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white p-3 type-body text-strong whitespace-pre-wrap break-words">
            {reply.result.output === null
              ? T.noOutput
              : JSON.stringify(reply.result.output, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
