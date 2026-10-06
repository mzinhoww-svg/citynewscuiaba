import type { Metadata } from "next";
import { Button, EmptyState, Panel } from "@/components";
import {
  ApprovalBanner,
  ReviewerModeCard,
  SwitchBoard,
  type SwitchCard,
  StudioScreen,
} from "@/components/estudio";
import { SWITCH_INFO, SWITCH_KEYS, SWITCH_TEXT as T } from "@/content/pt-BR/switches";
import { requireRole } from "@/lib/auth/require-role";
import { contingencyOverview, type FlagState } from "@/lib/db/queries/contingency";
import { reviewerSettings } from "@/lib/db/queries/reviewer";
import { formatDateTime } from "@/lib/format/date";
import { loadOrNull } from "../../load-error";
import { reviewerModeAction, switchAction } from "./actions";

export const metadata: Metadata = { title: "Interruptores · Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const since = (f: FlagState | null) =>
  f?.updatedBy ? T.since(f.updatedByName ?? T.unknownWho, formatDateTime(f.updatedAt)) : undefined;

/** Interruptores: todas as flags do sistema com estado e liga/desliga auditado. */
export default async function SwitchesPage() {
  const session = await requireRole("users.manage", undefined, {
    next: "/estudio/admin/interruptores",
  });
  const data = await loadOrNull("switches", () => contingencyOverview());
  const reviewer = await loadOrNull("reviewer", () => reviewerSettings());

  return (
    <StudioScreen section={T.sectionLabel} title={T.title} intro={T.intro} gap="lg">
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href="/estudio/admin/interruptores" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        <>
          <ApprovalBanner approvals={data.value.resumeRequests} currentUserId={session.userId} />
          <SwitchBoard
            run={switchAction}
            cards={SWITCH_KEYS.map((key): SwitchCard => {
              const info = SWITCH_INFO[key];
              const f = data.value.flags[key];
              return {
                key,
                title: info.title,
                about: info.about,
                effect: f?.enabled ? info.on : info.off,
                enabled: f ? f.enabled : null,
                since: since(f),
              };
            })}
          />
          {reviewer !== null && (
            <ReviewerModeCard
              mode={reviewer.value.mode}
              since={
                reviewer.value.updatedAt
                  ? T.since(
                      reviewer.value.updatedByName ?? T.unknownWho,
                      formatDateTime(reviewer.value.updatedAt),
                    )
                  : undefined
              }
              run={reviewerModeAction}
            />
          )}
          <Panel aria-labelledby="others" className="flex flex-col gap-2">
            <h2 id="others" className="type-section text-strong">
              {T.others.title}
            </h2>
            <p className="type-body text-body">{T.others.body}</p>
            <ul className="flex flex-col gap-1">
              {T.others.items.map((i) => (
                <li key={i.href}>
                  <a href={i.href} className="type-body font-medium text-link underline">
                    {i.label}
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </StudioScreen>
  );
}
