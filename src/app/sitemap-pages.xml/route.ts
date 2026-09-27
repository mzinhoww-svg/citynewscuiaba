import { connection } from "next/server";
import { SECTIONS } from "@/content/pt-BR/nav";
import { listPageEntries } from "@/lib/db/queries";
import { siteUrl } from "@/lib/seo/jsonld";
import { STATIC_PATHS, urlsetXml, xmlResponse } from "@/lib/seo/sitemap";

/**
 * Páginas fixas, editorias, coleções e eventos. Itens agregados não entram: não têm página
 * própria no CityNews (architecture §8).
 */
export async function GET() {
  await connection();
  const r = await listPageEntries();
  const fixed = [...STATIC_PATHS, ...SECTIONS.map((s) => s.href)].map((path) => ({ path }));
  return xmlResponse(urlsetXml([...fixed, ...(r.ok ? r.value : [])], siteUrl()), 900);
}
