import { forwardRef, type ReactNode } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "./Icon";

export interface InlineAlertProps {
  /** info = aviso neutro · success = ação concluída · warn = atenção (salvo só nesta visita) · error = falha */
  tone?: "info" | "success" | "warn" | "error";
  title?: string;
  children?: ReactNode;
  /** Ação ao lado do texto ("Desfazer", "Tentar de novo"). */
  action?: ReactNode;
  /** `status` anuncia sem interromper (padrão); `alert` só para falhas que pedem ação. */
  role?: "status" | "alert" | "none";
  className?: string;
}

const TONE: Record<
  NonNullable<InlineAlertProps["tone"]>,
  { box: string; icon: IconName; ink: string }
> = {
  info: { box: "border-line-section bg-card-white", icon: "info", ink: "text-meta" },
  success: { box: "border-line-section bg-cerrado-soft", icon: "check", ink: "text-service" },
  warn: { box: "border-line-section bg-atencao-soft", icon: "triangle-alert", ink: "text-warn" },
  error: { box: "border-line-section bg-erro-soft", icon: "circle-alert", ink: "text-danger" },
};

/**
 * Alerta em linha (DESIGN.md §7): ícone, texto e ação; a cor só reforça. Fica no fluxo da
 * página, nunca cobre conteúdo. Com `role="status"` o leitor de tela anuncia a mudança.
 *
 * ```tsx
 * <InlineAlert tone="success" action={<Button size="sm" variant="outline">Desfazer</Button>}>MT Agora não aparece mais.</InlineAlert>
 * ```
 */
export const InlineAlert = forwardRef<HTMLDivElement, InlineAlertProps>(function InlineAlert(
  { tone = "info", title, children, action, role = "status", className },
  ref,
) {
  const t = TONE[tone];
  return (
    <div
      ref={ref}
      role={role === "none" ? undefined : role}
      tabIndex={-1}
      className={cx(
        "flex flex-wrap items-start gap-3 border px-4 py-3 outline-none focus-visible:ring-0",
        t.box,
        className,
      )}
    >
      <Icon name={t.icon} size={20} className={cx("mt-0.5 shrink-0", t.ink)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 type-body text-body">
        {title && <p className="font-semibold text-strong">{title}</p>}
        {children}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
});
