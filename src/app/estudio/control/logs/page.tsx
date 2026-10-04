import type { Metadata } from "next";
import { Button, EmptyState } from "@/components";
import { LogExplorer, StudioScreen } from "@/components/estudio";
import {
  AGENT_LABEL,
  CONTROL_TEXT as T,
  LEVEL_LABEL,
  stepLabel,
} from "@/content/pt-BR/control";
import { requireRole } from "@/lib/auth/require-role";
import {
  AGENT_STEPS,
  LOG_LEVELS,
  controlAbilities,
  logFiltersQuery,
  parseLogFilters,
} from "@/lib/control";
import { searchLogs, sourceOptions } from "@/lib/db/queries/control";
import { STEP_NAMES } from "@/lib/pipeline/types";
import { loadOrNull } from "../../load-error";

export const metadata: Metadata = { title: "Registros · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const PAGE = 50;
const BASE = "/estudio/control/logs";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("audit.view", undefined, { next: BASE });
  const can = controlAbilities(session.roles);
  const { form, query } = parseLogFilters(await searchParams);
  const data = await loadOrNull("control logs", async () => {
    const [rows, sources] = await Promise.all([
      searchLogs({ ...query, limit: PAGE + 1 }, { maskIp: !can.admin }),
      sourceOptions(),
    ]);
    return { rows, sources };
  });

  return (
    <StudioScreen section={T.sectionLabel} title={T.logs.title} intro={T.logs.intro}>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href={`${BASE}${logFiltersQuery(form)}`} size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        (() => {
          const rows = data.value.rows.slice(0, PAGE);
          const last = rows[rows.length - 1];
          const more = data.value.rows.length > PAGE && last;
          return (
            <LogExplorer
              action={BASE}
              filters={form}
              options={{
                sources: data.value.sources.map((s) => ({ value: s.slug, label: s.name })),
                steps: STEP_NAMES.map((s) => ({ value: s, label: stepLabel(s) })),
                levels: LOG_LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] ?? l })),
                agents: Object.keys(AGENT_STEPS).map((a) => ({
                  value: a,
                  label: AGENT_LABEL[a] ?? a,
                })),
              }}
              rows={rows.map((r) => ({
                id: r.id,
                at: r.at,
                runId: r.runId,
                step: r.step,
                itemRef: r.itemRef,
                level: r.level,
                message: r.message,
                details: JSON.stringify(r.details ?? {}, null, 2),
              }))}
              moreHref={more ? `${BASE}${logFiltersQuery(form, { antes: String(last.id) })}` : null}
              exportHref={`/api/control/logs/export${logFiltersQuery(form)}`}
              masked={!can.admin}
            />
          );
        })()
      )}
    </StudioScreen>
  );
}
