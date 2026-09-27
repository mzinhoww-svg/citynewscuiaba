import { connection } from "next/server";
import { listNewsEntries } from "@/lib/db/queries";
import { siteUrl } from "@/lib/seo/jsonld";
import { newsSitemapXml, xmlResponse } from "@/lib/seo/sitemap";

/** Google News: matérias das últimas 48 h. Sem banco, sitemap vazio (válido). */
export async function GET() {
  await connection();
  const now = new Date();
  const r = await listNewsEntries(now);
  return xmlResponse(newsSitemapXml(r.ok ? r.value : [], now, siteUrl()), 300);
}
