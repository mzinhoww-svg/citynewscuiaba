"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SOURCE_ACTION_TEXT } from "@/content/pt-BR/sources-admin";
import { COLLECTION_TAB_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import { Button } from "../../ui/Button";
import type { WizardAction, WizardActionResult } from "./AddSourceWizard";
import { ActionMessage } from "./fields";

export interface CollectionActionsProps {
  sourceId: string;
  canCollectNow: boolean;
  /** `testConnectionAction` (FS-T6). */
  testAction: WizardAction;
  /** `collectNowAction` (FS-T6). */
  collectNowAction: WizardAction;
  /** `/estudio/control/fontes/nova?url=…` (reabre as sugestões). */
  reanalyzeHref: string;
  className?: string;
}

const POLL_MS = 5_000;
const POLL_TIMES = 12;

/**
 * Botões da aba Coleta (spec §8): "Testar conexão" (sem ingestão), "Coletar agora" (com
 * atualização a cada 5 s por 1 min, para a tabela de runs mostrar o resultado) e "Reanalisar
 * link". Resultado em `role="status"`/`alert`.
 */
export function CollectionActions({
  sourceId,
  canCollectNow,
  testAction,
  collectNowAction,
  reanalyzeHref,
  className,
}: CollectionActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"test" | "collect" | null>(null);
  const [result, setResult] = useState<WizardActionResult | null>(null);
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    if (polls <= 0) return;
    const t = setTimeout(() => {
      router.refresh();
      setPolls((n) => n - 1);
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [polls, router]);

  async function run(kind: "test" | "collect") {
    const form = new FormData();
    form.set("id", sourceId);
    setBusy(kind);
    setResult(null);
    let r: WizardActionResult;
    try {
      r = await (kind === "test" ? testAction : collectNowAction)(form);
    } catch {
      r = { ok: false, message: SOURCE_ACTION_TEXT.unavailable };
    }
    setBusy(null);
    setResult(r);
    if (r.ok) {
      router.refresh();
      if (kind === "collect") setPolls(POLL_TIMES);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <Button size="md" variant="outline" disabled={busy !== null} onClick={() => run("test")}>
          {busy === "test" ? T.testing : T.test}
        </Button>
        {canCollectNow && (
          <Button
            size="md"
            icon="refresh-cw"
            disabled={busy !== null}
            onClick={() => run("collect")}
          >
            {T.collectNow}
          </Button>
        )}
        <Button size="md" variant="outline" href={reanalyzeHref}>
          {T.reanalyze}
        </Button>
      </div>
      <div className="mt-3 empty:hidden">
        <ActionMessage result={result} />
      </div>
    </div>
  );
}
