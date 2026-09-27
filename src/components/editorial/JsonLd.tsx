import { ldScript } from "@/lib/seo/jsonld";

export interface JsonLdProps {
  data: Record<string, unknown>;
}

/**
 * Dados estruturados (schema.org) em `<script type="application/ld+json">`. É bloco de dados,
 * não script executável: a CSP não o bloqueia e o conteúdo tem "<" escapado.
 */
export function JsonLd({ data }: JsonLdProps) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(data) }} />;
}
