import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, EmptyState, InlineAlert, PromptEditor, VersionCompare } from "@/components";
import { APPROVAL_ERROR_TEXT } from "@/content/pt-BR/approvals";
import { AI_ADMIN_TEXT as T, agentLabel } from "@/content/pt-BR/control-ai";
import { diffPrompt } from "@/lib/ai/prompt-diff";
import { canDecideApproval } from "@/lib/approvals/kinds";
import { loginRedirect } from "@/lib/auth";
import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import {
  getAgent,
  listPromptVersions,
  type AgentRow,
  type PromptRow,
} from "@/lib/db/queries/ai-admin";
import { formatDateTime } from "@/lib/format/date";
import { savePromptAction } from "./actions";
import { PromptHistory } from "./PromptHistory";

export const metadata: Metadata = { title: "Prompts · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const intOf = (s: string): number | null => (/^[1-9][0-9]{0,9}$/.test(s) ? Number(s) : null);

const ERROR_TEXT: Record<string, string> = {
  forbidden: T.forbidden,
  not_found: T.promptNotFound,
  self_approval: APPROVAL_ERROR_TEXT.self_approval,
  approval_required: T.approvalRequired,
  stale: APPROVAL_ERROR_TEXT.stale,
  invalid: T.actionFailed,
};

export default async function PromptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const { id } = await params;
  const next = `/estudio/control/prompts/${encodeURIComponent(id)}`;
  const session = await getSession();
  if (!session) redirect(loginRedirect(next));
  if (!canAccess(session.roles, "prompt.publish")) redirect(loginRedirect(next, "sem-permissao"));
  const sp = await searchParams;
  const canCreate = session.roles.some((r) => r.role === "operador_ia");
  const canDecide = canDecideApproval(session.roles, "prompt.publish");

  let data: { agent: AgentRow | null; versions: PromptRow[] } | null = null;
  try {
    const agent = await getAgent(id);
    data = { agent, versions: agent ? await listPromptVersions(id) : [] };
  } catch (e) {
    console.error("estudio prompts:", e instanceof Error ? e.message : e);
  }

  const back = (
    <Button href="/estudio/control/agentes" size="sm" variant="outline" icon="arrow-left">
      {T.promptsBack}
    </Button>
  );

  if (data === null) {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="type-screen-title text-strong">{T.promptsTitle(agentLabel(id))}</h1>
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href={next} size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      </section>
    );
  }
  if (data.agent === null) {
    return (
      <section className="flex flex-col gap-6">
        <EmptyState as="h1" title={T.promptsNotFoundTitle} actions={back}>
          {T.promptsNotFoundBody}
        </EmptyState>
      </section>
    );
  }

  const { versions } = data;
  const production = versions.find((v) => v.status === "production") ?? null;
  const compare = intOf(one(sp.comparar));
  const selected = compare !== null ? versions.find((v) => v.version === compare) : undefined;
  const okCode = one(sp.ok);
  const version = one(sp.versao);
  const done =
    okCode === "proposta"
      ? T.proposed(Number(version))
      : okCode === "publicada"
        ? T.published(Number(version))
        : okCode === "rollback"
          ? T.rollbackDone(Number(version), Number(one(sp.de)))
          : null;
  const errorText = ERROR_TEXT[one(sp.erro)];

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div>{back}</div>
        <h1 className="type-screen-title text-strong">{T.promptsTitle(agentLabel(id))}</h1>
        <p className="type-body text-meta">{data.agent.function}</p>
        <p className="type-body text-meta">{T.promptsIntro}</p>
      </header>

      {done && (
        <InlineAlert
          tone="success"
          role="status"
          action={
            okCode !== "publicada" ? (
              <Button href="/estudio/control/aprovacoes" size="sm" variant="outline">
                {T.goApprovals}
              </Button>
            ) : undefined
          }
        >
          {done}
        </InlineAlert>
      )}
      {errorText && (
        <InlineAlert tone="error" role="alert">
          {errorText}
        </InlineAlert>
      )}

      <section aria-labelledby="prompt-producao" className="flex flex-col gap-3">
        <h2 id="prompt-producao" className="type-section text-strong">
          {T.productionTitle}
        </h2>
        {production ? (
          <>
            <p className="type-body text-body">
              {production.approvedBy.some((a) => a !== production.authorId)
                ? T.productionLine(
                    production.version,
                    production.approverName ?? T.unknownPerson,
                    formatDateTime(production.createdAt),
                  )
                : T.productionSeed(production.version)}
            </p>
            <div
              role="region"
              aria-label={T.promptBodyLabel}
              tabIndex={0}
              className="max-h-[24rem] overflow-auto rounded-lg border border-line-subtle bg-card-white p-4"
            >
              <pre className="whitespace-pre-wrap type-body text-body">{production.body}</pre>
            </div>
          </>
        ) : (
          <InlineAlert tone="warn" role="none">
            {T.productionNone}
          </InlineAlert>
        )}
      </section>

      <section aria-labelledby="prompt-nova" className="flex flex-col gap-4">
        <h2 id="prompt-nova" className="type-section text-strong">
          {T.editorTitle}
        </h2>
        {canCreate ? (
          <>
            <p className="type-body text-meta">{T.editorIntro}</p>
            <PromptEditor
              key={production?.id ?? "sem-producao"}
              baseBody={production?.body ?? ""}
              save={savePromptAction.bind(null, id)}
            />
          </>
        ) : (
          <InlineAlert tone="info" role="none">
            {T.cannotEdit}
          </InlineAlert>
        )}
      </section>

      <section aria-labelledby="prompt-historico" className="flex flex-col gap-4">
        <h2 id="prompt-historico" className="type-section text-strong">
          {T.historyTitle}
        </h2>
        <p className="type-meta text-meta">{T.rollbackNote}</p>
        <PromptHistory
          agentId={id}
          rows={versions}
          viewerId={session.userId}
          canCreate={canCreate}
          canDecide={canDecide}
        />
        {selected && (
          <section aria-labelledby="prompt-comparacao" className="flex flex-col gap-3">
            <h3 id="prompt-comparacao" className="type-label text-16 text-strong">
              {T.compareTitle(selected.version, production?.version ?? null)}
            </h3>
            <VersionCompare
              fromLabel={production ? `Versão ${production.version}` : "Produção"}
              toLabel={`Versão ${selected.version}`}
              fields={[
                {
                  label: "Texto do prompt",
                  ops: diffPrompt(production?.body ?? "", selected.body),
                },
              ]}
            />
          </section>
        )}
      </section>
    </section>
  );
}
