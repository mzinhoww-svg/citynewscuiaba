import type { Metadata } from "next";
import Link from "next/link";
import { ADMIN_OVERVIEW as T } from "@/content/pt-BR/admin";
import { requireRole } from "@/lib/auth/require-role";
import { listUsers } from "@/lib/admin/users";
import { pendingApprovals } from "@/lib/approvals";
import { AdminLoadError } from "./load-error";

export const metadata: Metadata = { title: "Administração · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin";

export default async function AdminOverviewPage() {
  await requireRole("users.manage", undefined, { next: NEXT });
  let stats: { users: number; invites: number; approvals: number } | null = null;
  try {
    const [{ people, invites }, approvals] = await Promise.all([listUsers(), pendingApprovals("")]);
    stats = {
      users: people.filter((p) => p.roles.length > 0).length,
      invites: invites.length,
      approvals: approvals.filter((a) => a.kind === "role.admin").length,
    };
  } catch (e) {
    console.error("estudio admin:", e instanceof Error ? e.message : e);
  }
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      {stats === null ? (
        <AdminLoadError href={NEXT} />
      ) : (
        <ul aria-label="Resumo" className="flex flex-wrap gap-x-8 gap-y-2 type-body text-strong">
          <li>{T.countUsers(stats.users)}</li>
          <li>{T.countInvites(stats.invites)}</li>
          <li>{T.countApprovals(stats.approvals)}</li>
        </ul>
      )}
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {T.cards.map((c) => (
          <li
            key={c.href}
            className="relative flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <h2 className="type-headline-sm text-strong">
              <Link href={c.href} className="card-link no-underline">
                {c.title}
              </Link>
            </h2>
            <p className="type-body text-meta">{c.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
