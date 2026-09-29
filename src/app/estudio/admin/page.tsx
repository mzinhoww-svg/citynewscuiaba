import type { Metadata } from "next";
import Link from "next/link";
import { ApprovalBanner, Icon, KpiStrip } from "@/components";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { adminOverview } from "@/lib/db/queries/admin";
import { loadOrNull } from "../load-error";
import { ADMIN_NAV } from "./nav";
import { AdminScreen } from "./screen";

export const metadata: Metadata = { title: "Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** A01 · Painel da administração: indicadores e atalhos para cada área. */
export default async function AdminPage() {
  const session = await requireRole("users.manage", undefined, { next: "/estudio/admin" });
  const data = await loadOrNull("admin overview", () => adminOverview());
  const D = T.dashboard;
  const areas = ADMIN_NAV.filter((n) => !n.exact && canAccess(session.roles, n.action));

  return (
    <AdminScreen title={D.title} intro={D.intro} retryHref="/estudio/admin" failed={data === null}>
      {data && (
        <>
          <ApprovalBanner approvals={data.value.adminRequests} currentUserId={session.userId} />
          <KpiStrip
            label={D.kpis}
            items={[
              {
                label: D.users,
                value: data.value.staff,
                icon: "users",
                href: "/estudio/admin/usuarios",
              },
              {
                label: D.invites,
                value: data.value.pendingInvites,
                icon: "mail",
                href: "/estudio/admin/usuarios",
                attention: data.value.pendingInvites > 0,
              },
              {
                label: D.approvals,
                value: data.value.pendingApprovals,
                icon: "file-check",
                href: "/estudio/control/aprovacoes",
                attention: data.value.pendingApprovals > 0,
              },
              {
                label: D.teams,
                value: data.value.teams,
                icon: "user",
                href: "/estudio/admin/equipes",
              },
              {
                label: D.homeVersion,
                value: data.value.homeVersion ?? 0,
                icon: "house",
                href: "/estudio/admin/home",
              },
              {
                label: D.tagSuggestions,
                value: data.value.tagSuggestions,
                icon: "layers",
                href: "/estudio/admin/taxonomia",
                attention: data.value.tagSuggestions > 0,
              },
            ]}
          />
          <section aria-labelledby="admin-areas" className="flex flex-col gap-3">
            <h2 id="admin-areas" className="type-section text-strong">
              {D.areas}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {areas.map((a) => (
                <li key={a.href}>
                  <Link
                    href={a.href}
                    className="flex min-h-tap items-center gap-3 rounded-lg border border-line-subtle bg-card-white p-4 no-underline hover:border-line-control"
                  >
                    <Icon name={a.icon} size={20} className="shrink-0 text-meta" />
                    <span className="type-body font-medium text-strong">{a.label}</span>
                    <Icon name="chevron-right" size={16} className="ml-auto text-meta" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </AdminScreen>
  );
}
