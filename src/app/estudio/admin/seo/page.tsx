import type { Metadata } from "next";
import { SeoPanel } from "@/components/estudio";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import { requireRole } from "@/lib/auth/require-role";
import { seoOverview } from "@/lib/db/queries/admin-ops";
import { SITEMAP_CHILDREN } from "@/lib/seo/sitemap";
import robots from "@/app/robots";
import { loadOrNull } from "../../load-error";
import { deleteRedirectAction, saveRedirectAction, saveTitleTemplateAction } from "../ops-actions";
import { AdminScreen } from "../screen";

export const metadata: Metadata = { title: "SEO · Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** A08 · SEO: modelo de título, sitemaps, robots, redirecionamentos, dados estruturados e verificação. */
export default async function SeoPage() {
  await requireRole("site.manage", undefined, { next: "/estudio/admin/seo" });
  const data = await loadOrNull("admin seo", () => seoOverview());
  const rules = robots().rules;
  const disallow = (Array.isArray(rules) ? rules : [rules]).flatMap((r) =>
    Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : [],
  );
  return (
    <AdminScreen
      title={T.seo.title}
      intro={T.seo.intro}
      retryHref="/estudio/admin/seo"
      failed={data === null}
    >
      {data && (
        <SeoPanel
          data={data.value}
          sitemaps={SITEMAP_CHILDREN}
          robotsDisallow={disallow}
          saveTitleTemplate={saveTitleTemplateAction}
          saveRedirect={saveRedirectAction}
          removeRedirect={deleteRedirectAction}
        />
      )}
    </AdminScreen>
  );
}
