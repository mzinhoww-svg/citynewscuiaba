"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { AI_OPS_TEXT as T } from "@/content/pt-BR/control-ai-ops";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { Select } from "../ui/Select";

export interface EvalRunButtonProps {
  agentId: string;
  versions: { version: number; status: string }[];
  /** Versão inicial (a em produção, ou a mais nova). */
  initial: number | null;
  run: (input: {
    agentId: string;
    promptVersion: number;
  }) => Promise<{ ok: true; promptVersion: number } | { ok: false; message: string }>;
}

/** Executa a regressão (provedor falso) sobre uma versão de prompt e recarrega o histórico. */
export function EvalRunButton({ agentId, versions, initial, run }: EvalRunButtonProps) {
  const uid = useId();
  const router = useRouter();
  const [version, setVersion] = useState(String(initial ?? versions[0]?.version ?? ""));
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (version === "" || pending) return;
        setState(null);
        startTransition(async () => {
          const r = await run({ agentId, promptVersion: Number(version) });
          if (r.ok) {
            setState({ tone: "success", text: T.runDone(r.promptVersion) });
            router.refresh();
          } else {
            setState({ tone: "error", text: r.message });
          }
        });
      }}
    >
      <Select
        id={`${uid}-version`}
        name="version"
        label={T.runVersion}
        value={version}
        onChange={setVersion}
        options={versions.map((v) => ({
          value: String(v.version),
          label: T.runVersionOption(v.version, v.status),
        }))}
      />
      <div className="flex flex-col gap-2">
        <div>
          <Button type="submit" size="md" icon="play" disabled={pending || version === ""}>
            {pending ? T.runBusy : T.runButton}
          </Button>
        </div>
        <p className="type-meta text-meta">{T.runHint}</p>
      </div>
      {state && (
        <InlineAlert tone={state.tone} role={state.tone === "error" ? "alert" : "status"}>
          {state.text}
        </InlineAlert>
      )}
    </form>
  );
}
