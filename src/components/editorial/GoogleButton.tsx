import { GOOGLE_TEXT } from "@/content/pt-BR/account";

export interface GoogleButtonProps {
  /** Server Action que inicia o OAuth do Google (`googleAction` de `/entrar`). */
  action: (form: FormData) => Promise<void>;
  /** Destino depois de entrar (já validado por `safeNext`). */
  next: string;
  /** Texto do botão (padrão: "Continuar com o Google"). */
  label?: string;
}

/**
 * Botão do Google no topo do login e do cadastro (UI-T12, spec de UI pública §4.7), nas
 * diretrizes de marca do Google: fundo branco nos dois temas, borda neutra, "G" oficial de
 * 4 cores, 56 px, largura total e elevação leve. O "G" é arquivo estático de marca
 * (`public/brand/google-g.svg`), exceção documentada à regra de tokens: as cores são fixas por
 * exigência do Google. O nome acessível vem do texto; o logotipo é decorativo.
 *
 * ```tsx
 * {google && (<><GoogleButton action={google} next={next} /><EmailDivider /></>)}
 * ```
 */
export function GoogleButton({ action, next, label = GOOGLE_TEXT.button }: GoogleButtonProps) {
  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-pill border border-line-control bg-branco px-6 text-16 font-semibold leading-none text-tinta shadow-sm transition-[transform,background-color] duration-(--dur-fast) ease-(--ease-standard) hover:bg-nevoa motion-safe:active:scale-98"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- logotipo de marca estático, 20 px */}
          <img src="/brand/google-g.svg" alt="" className="size-5 shrink-0" />
          {label}
        </button>
      </form>
      <p className="text-center type-meta text-meta">{GOOGLE_TEXT.privacy}</p>
    </div>
  );
}

/** Divisor "ou use seu e-mail" entre o Google e o formulário de e-mail. Só com o Google ligado. */
export function EmailDivider() {
  return (
    <p className="flex items-center gap-3 type-meta text-meta before:h-px before:flex-1 before:bg-line-subtle after:h-px after:flex-1 after:bg-line-subtle">
      {GOOGLE_TEXT.divider}
    </p>
  );
}
