import type { Metadata } from "next";
import Link from "next/link";
import { KpiStrip } from "@/components/estudio";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import { requireRole } from "@/lib/auth/require-role";
import { governanceOverview } from "@/lib/db/queries/admin-ops";
import { loadOrNull } from "../../load-error";
import { AdminScreen } from "../screen";

export const metadata: Metadata = {
  title: "Governança editorial · Administração · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

/** A12 · Governança editorial: indicadores, filas e políticas públicas. */
export default async function GovernancePage() {
  await requireRole("site.manage", undefined, { next: "/estudio/admin/governanca" });
  const data = await loadOrNull("admin governance", () => governanceOverview());
  const G = T.governance;
  const v = data?.value;
  const total = v ? v.publishedHuman7d + v.publishedAuto7d : 0;
  const pct = v && total > 0 ? Math.round((v.publishedAuto7d / total) * 100) : 0;
  return (
    <AdminScreen
      title={G.title}
      intro={G.intro}
      retryHref="/estudio/admin/governanca"
      failed={data === null}
    >
      {v && (
        <div className="flex flex-col gap-8">
          <KpiStrip
            label={G.kpis}
            items={[
              {
                label: G.correctionsOpen,
                value: v.correctionsOpen,
                icon: "check",
                href: "/estudio/correcoes",
              },
              {
                label: G.correctionsOverdue,
                value: v.correctionsOverdue,
                icon: "clock",
                href: "/estudio/correcoes",
                attention: v.correctionsOverdue > 0,
              },
              {
                label: G.rightOfReply,
                value: v.rightOfReplyOpen,
                icon: "message-circle",
                href: "/estudio/correcoes",
                attention: v.rightOfReplyOpen > 0,
              },
              {
                label: G.reportsOpen,
                value: v.reportsOpen,
                icon: "flag",
                href: "/estudio/denuncias",
              },
              {
                label: G.approvalsPending,
                value: v.approvalsPending,
                icon: "file-check",
                href: "/estudio/control/aprovacoes",
                attention: v.approvalsPending > 0,
              },
              { label: G.publishedHuman, value: v.publishedHuman7d, icon: "user" },
              { label: G.publishedAuto, value: v.publishedAuto7d, icon: "gauge" },
              { label: G.correctionsPublished, value: v.correctionsPublished30d, icon: "history" },
            ]}
          />
          <p className="type-body text-strong">{G.autoShare(pct)}</p>
          <div className="grid gap-6 md:grid-cols-2">
            <section
              aria-labelledby="gov-queues"
              className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-4"
            >
              <h2 id="gov-queues" className="type-section text-strong">
                {G.queues}
              </h2>
              <ul className="flex flex-col gap-1 type-body">
                {G.queueLinks.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="font-medium text-link underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section
              aria-labelledby="gov-principles"
              className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-4"
            >
              <h2 id="gov-principles" className="type-section text-strong">
                {G.principles}
              </h2>
              <ul className="flex flex-col gap-1 type-body">
                {G.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="font-medium text-link underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </AdminScreen>
  );
}
