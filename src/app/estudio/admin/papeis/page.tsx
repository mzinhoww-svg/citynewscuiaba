import type { Metadata } from "next";
import { AdminTable } from "@/components";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { ROLE_LABEL } from "@/content/pt-BR/studio";
import { ACTIONS, ROLES, grantOf } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/require-role";
import { listStaff } from "@/lib/db/queries/admin";
import { loadOrNull } from "../../load-error";
import { AdminScreen } from "../screen";

export const metadata: Metadata = {
  title: "Papéis e permissões · Administração · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

/** A03 · Papéis e permissões: matriz em vigor e quem tem cada papel. */
export default async function RolesPage() {
  await requireRole("users.manage", undefined, { next: "/estudio/admin/papeis" });
  const data = await loadOrNull("admin roles", () => listStaff());
  const R = T.roles;
  return (
    <AdminScreen
      title={R.title}
      intro={R.intro}
      retryHref="/estudio/admin/papeis"
      failed={data === null}
    >
      {data && (
        <div className="flex flex-col gap-8">
          <AdminTable
            caption={R.table}
            headers={[R.action, ...ROLES.map((r) => ROLE_LABEL[r])]}
            minWidth="min-w-[64rem]"
          >
            {ACTIONS.map((a) => (
              <tr key={a} className="border-b border-line-subtle last:border-0">
                <th scope="row" className="px-3 py-2 type-body font-medium text-strong">
                  <code className="font-mono text-14">{a}</code>
                </th>
                {ROLES.map((r) => {
                  const g = grantOf(r, a);
                  return (
                    <td key={r} className="px-3 py-2 type-body text-body">
                      {g ? (
                        <span className={g === "all" ? "font-medium text-strong" : ""}>
                          {R.grant[g]}
                        </span>
                      ) : (
                        <span className="text-meta">{R.grant.no}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </AdminTable>

          <section aria-labelledby="roles-people" className="flex flex-col gap-3">
            <h2 id="roles-people" className="type-section text-strong">
              {R.people}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ROLES.map((r) => {
                const who = data.value.filter((p) => p.roles.some((x) => x.role === r));
                return (
                  <li
                    key={r}
                    className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4"
                  >
                    <h3 className="type-body font-semibold text-strong">{ROLE_LABEL[r]}</h3>
                    <p className="type-body text-body">
                      {who.length ? who.map((p) => p.name).join(", ") : R.nobody}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section
            aria-labelledby="roles-critical"
            className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <h2 id="roles-critical" className="type-section text-strong">
              {R.criticalTitle}
            </h2>
            <ul className="list-disc pl-5 type-body text-body">
              {R.critical.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </AdminScreen>
  );
}
