import { AI_ADMIN_TEXT as A, agentLabel } from "@/content/pt-BR/control-ai";
import { AI_OPS_TEXT as T } from "@/content/pt-BR/control-ai-ops";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { AiOpsTable, CELL, ROW } from "./AiOpsTable";

export interface KnowledgePanelProps {
  corpus: {
    articles: { total: number; indexed: number };
    items: { total: number; indexed: number };
  };
  sources: {
    id: string;
    name: string;
    kind: string;
    status: string;
    reliability: string;
    republishPolicy: string;
    imagePolicy: string;
  }[];
  agents: { id: string; function: string; promptVersion: number | null }[];
  /** Quem administra fontes vê o atalho. */
  canManageSources: boolean;
}

const coverage = (total: number, indexed: number) =>
  total === 0 ? T.notApplicable : T.pct1(indexed / total);

/** Bases de conhecimento da IA (O13): acervo, fontes e instruções em produção. Só leitura. */
export function KnowledgePanel({ corpus, sources, agents, canManageSources }: KnowledgePanelProps) {
  const rows = [
    { label: T.corpusArticles, ...corpus.articles },
    { label: T.corpusItems, ...corpus.items },
  ];
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="ai-corpus" className="flex flex-col gap-3">
        <h2 id="ai-corpus" className="type-section text-strong">
          {T.corpusTitle}
        </h2>
        <AiOpsTable
          caption={T.corpusCaption}
          columns={[T.colBase, T.colTotal, T.colIndexed, T.colCoverage]}
        >
          {rows.map((r) => (
            <tr key={r.label} className={ROW}>
              <th scope="row" className={`${CELL} font-semibold text-strong`}>
                {r.label}
              </th>
              <td className={`${CELL} tabular-nums`}>{r.total.toLocaleString("pt-BR")}</td>
              <td className={`${CELL} tabular-nums`}>{r.indexed.toLocaleString("pt-BR")}</td>
              <td className={`${CELL} tabular-nums`}>{coverage(r.total, r.indexed)}</td>
            </tr>
          ))}
        </AiOpsTable>
        <p className="type-meta text-meta">{T.corpusNote}</p>
        <p className="type-meta text-meta">{T.dataRule}</p>
      </section>

      <section aria-labelledby="ai-sources" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="ai-sources" className="type-section text-strong">
            {T.sourcesTitle}
          </h2>
          {canManageSources && (
            <Button href="/estudio/control/fontes" size="sm" variant="outline">
              {T.sourcesManage}
            </Button>
          )}
        </div>
        {sources.length === 0 ? (
          <EmptyState title={T.sourcesEmptyTitle}>{T.sourcesEmptyBody}</EmptyState>
        ) : (
          <AiOpsTable
            caption={T.sourcesCaption}
            minWidthClass="min-w-[52rem]"
            columns={[
              T.colSource,
              T.colKind,
              T.colStatus,
              T.colReliability,
              T.colRepublish,
              T.colImage,
            ]}
          >
            {sources.map((s) => (
              <tr key={s.id} className={ROW}>
                <th scope="row" className={`${CELL} font-semibold text-strong`}>
                  {s.name}
                </th>
                <td className={CELL}>{s.kind}</td>
                <td className={CELL}>{s.status}</td>
                <td className={CELL}>{s.reliability}</td>
                <td className={CELL}>{s.republishPolicy}</td>
                <td className={CELL}>{s.imagePolicy}</td>
              </tr>
            ))}
          </AiOpsTable>
        )}
      </section>

      <section aria-labelledby="ai-prompts" className="flex flex-col gap-3">
        <h2 id="ai-prompts" className="type-section text-strong">
          {T.promptsTitle}
        </h2>
        <AiOpsTable
          caption={T.promptsCaption}
          minWidthClass="min-w-[48rem]"
          columns={[T.colAgent, T.colFunction, T.colPromptVersion, A.colActions]}
        >
          {agents.map((a) => (
            <tr key={a.id} className={ROW}>
              <th scope="row" className={`${CELL} text-strong`}>
                <span className="block font-semibold">{agentLabel(a.id)}</span>
                <span className="block type-meta text-meta">{a.id}</span>
              </th>
              <td className={`${CELL} max-w-[28rem]`}>{a.function}</td>
              <td className={CELL}>
                {a.promptVersion === null ? T.noPrompt : T.promptVersion(a.promptVersion)}
              </td>
              <td className={CELL}>
                <Button
                  href={`/estudio/control/prompts/${a.id}`}
                  size="sm"
                  variant="outline"
                  aria-label={T.promptsManageNamed(agentLabel(a.id))}
                >
                  {T.promptsManage}
                </Button>
              </td>
            </tr>
          ))}
        </AiOpsTable>
      </section>
    </div>
  );
}
