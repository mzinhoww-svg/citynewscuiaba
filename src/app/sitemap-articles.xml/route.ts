import { connection } from "next/server";
import { listArticleEntries } from "@/lib/db/queries";
import { siteUrl } from "@/lib/seo/jsonld";
import { urlsetXml, xmlResponse } from "@/lib/seo/sitemap";

/** Todas as matérias públicas (arquivadas saem: respondem 410). */
export async function GET() {
  await connection();
  const r = await listArticleEntries();
  return xmlResponse(urlsetXml(r.ok ? r.value : [], siteUrl()), 900);
}
