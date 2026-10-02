import { connection } from "next/server";
import { listTopicEntries } from "@/lib/db/queries";
import { siteUrl } from "@/lib/seo/jsonld";
import { urlsetXml, xmlResponse } from "@/lib/seo/sitemap";

/** Assuntos acompanhados. */
export async function GET() {
  await connection();
  const r = await listTopicEntries();
  return xmlResponse(urlsetXml(r.ok ? r.value : [], siteUrl()), 900);
}
