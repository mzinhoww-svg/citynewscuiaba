import type { Metadata } from "next";
import { Button, EmptyState, InlineAlert, SourceHealthTable } from "@/components";
import {
  MONITOR_TEXT as T,
  QUEUE_LABEL,
  STEP_LABEL,
  untilLabel,
} from "@/content/pt-BR/control-monitor";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { failuresView, type FailuresView } from "@/lib/db/queries/control";
import { formatDateTime } from "@/lib/format/date";
import type { StepName } from "@/lib/pipeline/types";
import { reprocessItemAction } from "./actions";

export const metadata: Metadata = { title: "Filas e falhas · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/falhas";
type Params = Record<string, string | string[] | undefined>;
const ERRORS: Record<string, string> = {
  forbidden: T.reprocess.forbidden,
  invalid: T.reprocess.invalid,
  failed: T.reprocess.failed,
};
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function FailuresPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireRole("metrics.view", undefined, { next: NEXT });
  const canAct = canAccess(session.roles, "source.manage");
  const sp = await searchParams;
  const ok = first(sp.ok);
  const error = ERRORS[first(sp.erro) ?? ""];

  let data: FailuresView | null = null;
  try {
    data = await failuresView();
  } catch (e) {
    console.error("control falhas:", e instanceof Error ? e.message : e);
  }
  const at = new Date().toISOString();

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.failures.title}</h1>
        <p className="type-body text-meta">{T.failures.intro}</p>
      </header>
      {ok !== undefined && /^\d+$/.test(ok) && (
        <InlineAlert tone="success" role="status">
          {T.failures.done(Number(ok))}
        </InlineAlert>
      )}
      {error && (
        <InlineAlert tone="error" role="alert">
          {error}
        </InlineAlert>
      )}
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.failures.errorTitle}
          actions={
            <Button href={NEXT} size="md" variant="outline">
              {T.failures.retry}
            </Button>
          }
        >
          {T.failures.errorBody}
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="fal-quarentena" className="flex flex-col gap-3">
            <h2 id="fal-quarentena" className="type-section text-strong">
              {T.failures.quarantineTitle}
            </h2>
            {data.quarantine.length === 0 ? (
              <EmptyState title={T.failures.quarantineEmpty} icon="shield" as="h3">
                {T.failures.quarantineEmptyBody}
              </EmptyState>
            ) : (
              <>
                {data.quarantineTotal > data.quarantine.length && (
                  <p className="type-meta text-meta">
                    {T.failures.quarantineMore(data.quarantine.length, data.quarantineTotal)}
                  </p>
                )}
                <div
                  role="region"
                  aria-label={T.failures.quarantineCaption}
                  tabIndex={0}
                  className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
                >
                  <table className="w-full min-w-[48rem] border-collapse text-left">
                    <caption className="sr-only">{T.failures.quarantineCaption}</caption>
                    <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                      <tr>
                        <th scope="col" className="px-3 py-3">
                          {T.failures.colStep}
                        </th>
                        <th scope="col" className="px-3 py-3">
                          {T.failures.colItem}
                        </th>
                        <th scope="col" className="px-3 py-3">
                          {T.failures.colError}
                        </th>
                        <th scope="col" className="px-3 py-3">
                          {T.failures.colReads}
                        </th>
                        <th scope="col" className="px-3 py-3">
                          {T.failures.colWhen}
                        </th>
                        {canAct && (
                          <th scope="col" className="px-3 py-3">
                            {T.failures.colAction}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.quarantine.map((q) => {
                        const label = STEP_LABEL[q.step as StepName] ?? q.step;
                        return (
                          <tr
                            key={q.id}
                            data-quarantine={q.id}
                            className="border-b border-line-subtle align-top last:border-b-0"
                          >
                            <th
                              scope="row"
                              className="px-3 py-3 type-body font-semibold text-strong"
                            >
                              {label}
                              <span className="block type-meta font-normal text-meta">
                                {QUEUE_LABEL[q.queue] ?? q.queue}
                              </span>
                            </th>
                            <td className="break-all px-3 py-3 type-body">{q.itemRef}</td>
                            <td className="px-3 py-3 type-body">{q.error}</td>
                            <td className="px-3 py-3 type-body tabular-nums">{q.reads}</td>
                            <td className="px-3 py-3 type-body tabular-nums">
                              {formatDateTime(q.at)}
                            </td>
                            {canAct && (
                              <td className="px-3 py-3">
                                <form action={reprocessItemAction}>
                                  <input type="hidden" name="ref" value={q.itemRef} />
                                  <input type="hidden" name="step" value={q.step} />
                                  <Button
                                    type="submit"
                                    size="sm"
                                    variant="outline"
                                    icon="refresh-cw"
                                    aria-label={T.failures.reprocessNamed(`${label}, ${q.itemRef}`)}
                                  >
                                    {T.failures.reprocess}
                                  </Button>
                                </form>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section aria-labelledby="fal-tentativas" className="flex flex-col gap-3">
            <h2 id="fal-tentativas" className="type-section text-strong">
              {T.failures.retryingTitle}
            </h2>
            {data.retrying.length === 0 ? (
              <p className="type-body text-meta">{T.failures.retryingEmpty}</p>
            ) : (
              <div
                role="region"
                aria-label={T.failures.retryingCaption}
                tabIndex={0}
                className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
              >
                <table className="w-full min-w-[44rem] border-collapse text-left">
                  <caption className="sr-only">{T.failures.retryingCaption}</caption>
                  <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                    <tr>
                      <th scope="col" className="px-3 py-3">
                        {T.failures.colStep}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.failures.colItem}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.failures.colError}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.failures.colReads}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.failures.colRetryAt}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.retrying.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-line-subtle align-top last:border-b-0"
                      >
                        <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                          {STEP_LABEL[r.step as StepName] ?? r.step}
                        </th>
                        <td className="break-all px-3 py-3 type-body">{r.itemRef}</td>
                        <td className="px-3 py-3 type-body">{r.error}</td>
                        <td className="px-3 py-3 type-body tabular-nums">{r.reads}</td>
                        <td className="px-3 py-3 type-body">
                          {untilLabel(r.retryAt, new Date(at))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="fal-fontes" className="flex flex-col gap-3">
            <h2 id="fal-fontes" className="type-section text-strong">
              {T.failures.sourcesTitle}
            </h2>
            {data.sources.filter((s) => s.state !== "ok").length === 0 ? (
              <p className="type-body text-meta">{T.failures.sourcesEmpty}</p>
            ) : (
              <SourceHealthTable rows={data.sources.filter((s) => s.state !== "ok")} at={at} />
            )}
          </section>
        </>
      )}
    </section>
  );
}
