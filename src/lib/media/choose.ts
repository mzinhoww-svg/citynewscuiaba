import { err, ok, type Result } from "@/lib/result";
import { checkImage } from "./checks";
import type { Candidate, ImagePolicy, MediaChoice, MediaCredit } from "./types";

/** Adequação semântica mínima para licenciada e acervo. */
export const MIN_FIT = 0.7;

export interface ChooseInput {
  /** Política de imagem da fonte do item que trouxe `original`. */
  sourcePolicy: ImagePolicy;
  /** Acordo com a fonte vigente (`sources.agreement_until` ≥ hoje). */
  hasAgreement: boolean;
  /** `feature_flags.image_reproduction_enabled`. */
  reproductionEnabled: boolean;
  /** Imagem da matéria original, já medida. */
  original?: Candidate;
  /** Banco de imagens licenciadas: vazio no MVP (spec §6.5). */
  licensed: Candidate[];
  /** Acervo ilustrativo aprovado. */
  archive: Candidate[];
  /** Há gerador disponível e o agente `image` permitiu ilustrar este assunto. */
  topicAllowsGenerated: boolean;
  /** Categoria de autonomia (`sections.autonomy_category`). */
  category: string;
  /** Algum item do assunto marcado sensível pelo `classify`. */
  sensitive?: boolean;
  tags?: string[];
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Categorias sem imagem gerada (regra 9: crime, tragédia, saúde individual). */
const NO_GENERATED_CATEGORIES = new Set(["seguranca", "saude"]);
/** Raízes de temas que nunca recebem imagem gerada. */
const NO_GENERATED_ROOTS = [
  "crim",
  "violen",
  "mort",
  "morre",
  "tragedi",
  "tragic",
  "acident",
  "suicid",
  "abus",
  "homicid",
  "assassin",
  "estupr",
  "feminicid",
  "sequestr",
  "overdose",
  "saude",
  "doenca",
  "hospital",
  "ferid",
  "vitima",
  "incendio",
  "desastre",
];

/** O tema admite imagem gerada? Nunca para crime, tragédia ou saúde individual (regra 9). */
export function mayGenerate(t: {
  category: string;
  sensitive?: boolean;
  tags?: string[];
}): boolean {
  if (t.sensitive) return false;
  if (NO_GENERATED_CATEGORIES.has(fold(t.category))) return false;
  const words = (t.tags ?? []).flatMap((tag) => fold(tag).split(/[^\p{L}\p{N}]+/u));
  return !words.some((w) => NO_GENERATED_ROOTS.some((r) => w.startsWith(r)));
}

const PHOTOREAL =
  /foto\s*-?\s*realista|fotorrealis|photo\s*-?\s*real|realistic|hiper\s*-?\s*realis|fotografia|\bfoto\b|retrato|rosto|selfie|\bface\b/;

/** Estilo fixo acrescentado a todo pedido ao gerador. */
export const GENERATION_STYLE =
  "Ilustração editorial plana, não fotorrealista, sem rostos nem pessoas reais identificáveis, sem texto.";

/**
 * Pedido ao gerador de imagem (regra 9): recusa fotografia, retrato ou rosto e acrescenta o
 * estilo não fotorrealista. O modelo nunca recebe um pedido de imagem de pessoa real.
 */
export function safeGenerationPrompt(prompt: string): Result<string, "photorealistic" | "empty"> {
  const p = prompt.trim();
  if (!p) return err("empty");
  if (PHOTOREAL.test(fold(p))) return err("photorealistic");
  return ok(`${p}. ${GENERATION_STYLE}`);
}

const creditOf = (c: Candidate): MediaCredit | null => {
  if (!c.sourceName) return null;
  return {
    sourceName: c.sourceName,
    ...(c.author?.trim() ? { author: c.author.trim() } : {}),
    url: c.url,
  };
};

const byFit = (a: Candidate, b: Candidate) => (b.fit ?? 0) - (a.fit ?? 0);

/**
 * Cascata da spec §6.5 (A-010): original com acordo → reprodução (política `reproduction` e flag
 * ligada, com crédito e link) → licenciada (vazia no MVP) → ilustrativa do acervo → gerada (se o
 * tema permitir) → card tipográfico. Toda imagem precisa passar em `checkImage`.
 */
export function chooseImage(c: ChooseInput): MediaChoice {
  const skipped: string[] = [];

  if (c.original) {
    const o = c.original;
    const useOriginal = c.sourcePolicy === "with_agreement" && c.hasAgreement;
    const useReproduction = c.sourcePolicy === "reproduction" && c.reproductionEnabled;
    if (useOriginal || useReproduction) {
      const kind = useOriginal ? "original" : "reproduction";
      const check = checkImage(o, kind);
      const credit = creditOf(o);
      if (check.ok && credit)
        return {
          kind,
          asset: o,
          credit,
          rationale: useOriginal
            ? `Foto da fonte ${credit.sourceName} com acordo vigente.`
            : `REPRODUÇÃO da imagem da matéria original de ${credit.sourceName} (política reproduction), com crédito e link para o original.`,
        };
      skipped.push(
        `imagem da fonte reprovada (${check.ok ? "sem crédito da fonte" : check.issues.join(", ")})`,
      );
    } else if (c.sourcePolicy === "reproduction") {
      skipped.push("reprodução desligada (image_reproduction_enabled)");
    } else {
      skipped.push(`política da fonte "${c.sourcePolicy}" não permite usar a imagem`);
    }
  }

  const pick = (list: Candidate[]) =>
    [...list].sort(byFit).find((x) => (x.fit ?? 0) >= MIN_FIT && checkImage(x).ok);

  const licensed = pick(c.licensed);
  if (licensed)
    return {
      kind: "licensed",
      asset: licensed,
      credit: creditOf(licensed),
      rationale: `Imagem licenciada com adequação ${(licensed.fit ?? 0).toFixed(2)}.`,
    };

  const archive = pick(c.archive);
  if (archive)
    return {
      kind: "illustrative",
      asset: archive,
      credit: null,
      rationale: [
        `Imagem ilustrativa do acervo (adequação ${(archive.fit ?? 0).toFixed(2)}).`,
        ...skipped,
      ].join(" "),
    };

  if (c.topicAllowsGenerated && mayGenerate(c))
    return {
      kind: "ai_generated",
      credit: null,
      rationale: ["Tema permite ilustração gerada, não fotorrealista.", ...skipped].join(" "),
    };

  return {
    kind: "typographic",
    credit: null,
    rationale: ["Sem imagem aprovada: card tipográfico da editoria.", ...skipped].join(" "),
  };
}
