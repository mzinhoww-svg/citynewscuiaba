import { Mark, mergeAttributes } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Marcas de origem no documento da matéria (plano P4, Global Constraints):
 * - `aiSuggestion`: trecho sugerido pela IA e aceito com clique humano. Guarda `agentId`,
 *   `promptVersion` e `acceptedBy`. Tracejado Azul IA (DESIGN.md R11), com texto para leitor
 *   de tela no atributo `data-origem`.
 * - `humanEdit`: trecho digitado por pessoa (inclusive sobre texto da IA, que perde a marca).
 */
export const AiSuggestion = Mark.create({
  name: "aiSuggestion",
  inclusive: false,
  addAttributes() {
    return {
      agentId: { default: null },
      promptVersion: { default: null },
      acceptedBy: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-ai-suggestion]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-ai-suggestion": "",
        class: "cn-mark-ai",
      }),
      0,
    ];
  },
});

export const HumanEdit = Mark.create({
  name: "humanEdit",
  inclusive: true,
  addAttributes() {
    return { by: { default: null } };
  },
  parseHTML() {
    return [{ tag: "span[data-human-edit]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-human-edit": "", class: "cn-mark-human" }),
      0,
    ];
  },
});

/**
 * Texto digitado recebe `humanEdit` (com quem editou) e perde `aiSuggestion`: a origem de cada
 * trecho fica no próprio documento salvo.
 */
export function humanTyping(userId: string) {
  return new Plugin({
    key: new PluginKey("cnHumanTyping"),
    props: {
      handleTextInput(view, from, to, text) {
        const { schema, tr } = view.state;
        const human = schema.marks.humanEdit;
        const ai = schema.marks.aiSuggestion;
        if (!human) return false;
        tr.insertText(text, from, to);
        const end = from + text.length;
        if (ai) tr.removeMark(from, end, ai);
        tr.addMark(from, end, human.create({ by: userId }));
        view.dispatch(tr);
        return true;
      },
    },
  });
}
