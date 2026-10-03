import type { Metadata } from "next";
import { Button, EmptyState } from "@/components";
import { ApprovalBanner, SwitchBoard, type SwitchCard } from "@/components/estudio";
import { SWITCH_INFO, SWITCH_KEYS, SWITCH_TEXT as T } from "@/content/pt-BR/switches";
import { requireRole } from "@/lib/auth/require-role";
import { contingencyOverview, type FlagState } from "@/lib/db/queries/contingency";
import { formatDateTime } from "@/lib/format/date";
import { loadOrNull } from "../../load-error";
import { switchAction } from "./actions";

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

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{T.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
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
                note: info.guarded && f && !f.enabled ? T.guardedNote : undefined,
              };
            })}
          />
          <section
            aria-labelledby="others"
            className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-4"
          >
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
          </section>
        </>
      )}
    </section>
  );
}
