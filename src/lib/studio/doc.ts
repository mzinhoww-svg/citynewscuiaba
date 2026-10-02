/**
 * Documento do editor (Tiptap/ProseMirror em JSON: doc → paragraph/heading → text com marcas).
 * Funções puras para o Estúdio: texto corrido para diff e parágrafo com a marca de sugestão.
 */

export interface DocMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface DocNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: DocMark[];
  content?: DocNode[];
}
export interface EditorDoc {
  type: "doc";
  content: DocNode[];
}

/** Marca de trecho sugerido pela IA e aceito por pessoa (agente, versão do prompt, quem aceitou). */
export interface AiSuggestionAttrs {
  agentId: string;
  promptVersion: number | null;
  acceptedBy: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function inline(node: unknown): string {
  if (!isRecord(node)) return "";
  if (node.type === "text" && typeof node.text === "string") return node.text;
  return Array.isArray(node.content) ? node.content.map(inline).join("") : "";
}

/** Texto do documento, um bloco por parágrafo (separados por linha em branco). */
export function docText(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.content)) return "";
  return body.content
    .map(inline)
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function emptyDoc(): EditorDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Parágrafo com o texto sugerido pela IA, marcado com a origem e quem aceitou. */
export function aiParagraph(text: string, attrs: AiSuggestionAttrs): DocNode {
  return {
    type: "paragraph",
    content: [{ type: "text", text, marks: [{ type: "aiSuggestion", attrs: { ...attrs } }] }],
  };
}

/** Acrescenta um parágrafo ao fim do documento (documento inválido vira um novo). */
export function appendParagraph(body: unknown, p: DocNode): EditorDoc {
  const content =
    isRecord(body) && Array.isArray(body.content)
      ? (body.content as DocNode[]).filter((n) => !(n.type === "paragraph" && !inline(n).trim()))
      : [];
  return { type: "doc", content: [...content, p] };
}
