import { err, ok } from "@/lib/result";
import type { NotificationChannel, NotificationInput } from "../ports";
import { stepError, type StepHandler } from "../run-step";
import type { PublishStepDeps } from "./write";

/** Janela de dedupe das notificações (architecture §4, etapa 20). */
export const NOTIFY_DEDUPE_SEC = 10 * 60;

const REF = /^article:([^#\s]+)#([a-z_]+)$/;

interface KindSpec {
  severity: NotificationInput["severity"];
  channels: NotificationChannel[];
  /** Agrupa por tipo (uma notificação por janela) em vez de uma por matéria. */
  grouped: boolean;
  title: (t: string) => string;
}

/**
 * Tipos de notificação. Control Center recebe tudo; o plantão (e-mail, fila sem envio até haver
 * provedor, B-005) só o que pede ação: urgente, IA indisponível, regras indisponíveis, retenção
 * e publicação automática com aviso.
 */
export const NOTIFY_KINDS: Record<string, KindSpec> = {
  review: {
    severity: "info",
    channels: ["control_center"],
    grouped: true,
    title: () => "Novas matérias na fila de revisão",
  },
  hold: {
    severity: "warn",
    channels: ["control_center", "oncall_email"],
    grouped: false,
    title: (t) => `Retida pelas regras: ${t}`,
  },
  breaking: {
    severity: "critical",
    channels: ["control_center", "oncall_email"],
    grouped: false,
    title: (t) => `Urgente aguardando revisão: ${t}`,
  },
  ai_unavailable: {
    severity: "warn",
    channels: ["control_center", "oncall_email"],
    grouped: true,
    title: () => "IA indisponível na redação: rascunhos sem IA em revisão",
  },
  rules_unavailable: {
    severity: "critical",
    channels: ["control_center", "oncall_email"],
    grouped: true,
    title: () => "Regras de autonomia indisponíveis: tudo vai para revisão",
  },
  auto_published: {
    severity: "info",
    channels: ["control_center"],
    grouped: false,
    title: (t) => `Publicada automaticamente: ${t}`,
  },
  auto_published_notify: {
    severity: "warn",
    channels: ["control_center", "oncall_email"],
    grouped: false,
    title: (t) => `Publicada automaticamente (com aviso): ${t}`,
  },
  new_sources: {
    severity: "info",
    channels: ["control_center"],
    grouped: false,
    title: (t) => `Novas fontes para matéria já com a redação: ${t}`,
  },
};

/**
 * Etapa 20 (notificar), na fila `notify`: grava no Control Center e na fila do plantão, com
 * dedupe de 10 min por tipo (ou por matéria) e canal. Nenhum e-mail é enviado (B-005).
 */
export function createNotifyStep(deps: Pick<PublishStepDeps, "repo">): StepHandler {
  return async (msg) => {
    const m = REF.exec(msg.itemRef);
    const articleId = m?.[1];
    const kind = m?.[2];
    const spec = kind ? NOTIFY_KINDS[kind] : undefined;
    if (!articleId || !kind || !spec)
      return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const ctx = await deps.repo.decisionContext(articleId);
    if (!ctx) return err(stepError.notFound(`matéria ${articleId} não encontrada`));

    const objectRef = `article:${articleId}`;
    const body = [
      ctx.title,
      `Editoria: ${ctx.sectionSlug}. Confiança ${ctx.confidence} (${ctx.confidenceScore.toFixed(2).replace(".", ",")}).`,
      `Estúdio: /estudio/materias/${articleId}`,
    ].join("\n");
    for (const channel of spec.channels)
      await deps.repo.notifyOnce(
        {
          kind,
          channel,
          severity: spec.severity,
          objectRef,
          dedupeKey: spec.grouped ? `kind:${kind}` : `${kind}:${objectRef}`,
          title: spec.title(ctx.title),
          body,
        },
        NOTIFY_DEDUPE_SEC,
      );
    return ok([]);
  };
}
