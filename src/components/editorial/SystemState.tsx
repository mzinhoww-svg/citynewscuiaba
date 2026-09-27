import type { ReactNode } from "react";
import { SYSTEM } from "@/content/pt-BR/system";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { SearchBar } from "../ui/SearchBar";

export interface SystemStateProps {
  title: string;
  icon?: IconName;
  children?: ReactNode;
  actions?: ReactNode;
  /** Mostra o campo de busca (404 e 410). */
  search?: boolean;
}

/**
 * Página de estado de sistema (P25): título como h1, explicação em linguagem simples, busca
 * opcional e próximas ações. Usada pelo 404, pelo 410 da matéria e pelas fronteiras de erro.
 *
 * ```tsx
 * <SystemState title="Não encontramos esta página" search actions={<Button href="/">…</Button>} />
 * ```
 */
export function SystemState({
  title,
  icon = "circle-alert",
  children,
  actions,
  search = false,
}: SystemStateProps) {
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-gutter py-12 lg:py-16">
      <div className="flex max-w-read flex-col items-start gap-4">
        <Icon name={icon} size={24} className="text-meta" />
        <h1 className="type-screen-title text-balance text-strong">{title}</h1>
        {children && <div className="flex flex-col gap-3 type-body text-body">{children}</div>}
      </div>
      {search && (
        <SearchBar
          className="w-full max-w-read"
          label={SYSTEM.searchLabel}
          placeholder={SYSTEM.searchPlaceholder}
          showFilter={false}
        />
      )}
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/** 404 (P25): busca e caminhos de volta. */
export function NotFoundState() {
  return (
    <SystemState title={SYSTEM.notFoundTitle} icon="search" search actions={<BackLinks />}>
      <p>{SYSTEM.notFoundText}</p>
    </SystemState>
  );
}

function BackLinks() {
  return (
    <>
      <Button href="/" size="md">
        {SYSTEM.backHome}
      </Button>
      <Button href="/explorar" size="md" variant="outline">
        {SYSTEM.explore}
      </Button>
    </>
  );
}

/** 410 (P25): motivo informado pela redação, correções e busca. */
export function GoneState({ reason }: { reason: string }) {
  return (
    <SystemState
      title={SYSTEM.goneTitle}
      search
      actions={
        <>
          <Button href="/correcoes" size="md">
            {SYSTEM.goneCorrections}
          </Button>
          <Button href="/" size="md" variant="outline">
            {SYSTEM.backHome}
          </Button>
        </>
      }
    >
      <p>
        <strong className="font-semibold text-strong">{SYSTEM.goneReasonLabel}</strong> {reason}
      </p>
      <p>{SYSTEM.goneText}</p>
    </SystemState>
  );
}
