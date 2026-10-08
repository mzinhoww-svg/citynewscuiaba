import type { ReactNode } from "react";
import { PROFILE_TEXT as T } from "@/content/pt-BR/account";
import { initialsOf } from "@/lib/format/initials";
import { Icon } from "../ui/Icon";
import { AvatarCircle } from "./AvatarCircle";

export interface ProfileIdentityProps {
  name: string;
  email: string;
  neighborhood: string | null;
  /** Ação ao lado da identidade (ex.: "Editar perfil"). */
  children?: ReactNode;
}

/** Topo do Perfil com conta: monograma, nome, e-mail e bairro principal. */
export function ProfileIdentity({ name, email, neighborhood, children }: ProfileIdentityProps) {
  return (
    <section aria-labelledby="perfil-conta" className="flex flex-col gap-4">
      <h2 id="perfil-conta" className="sr-only">
        {T.account.title}
      </h2>
      <div className="flex items-center gap-4">
        <AvatarCircle
          name={name}
          mono={initialsOf(name)}
          monoBg="bg-avatar-1"
          className="size-16 text-20"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-20 leading-tight font-bold text-strong">{name}</p>
          <p className="type-body break-all text-meta">{email}</p>
          {neighborhood && (
            <p className="flex items-center gap-1.5 type-body font-semibold text-service">
              <Icon name="map-pin" size={16} />
              {neighborhood}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

export interface ProfileGroupProps {
  id: string;
  title: string;
  /** `nav` quando o grupo só navega; `section` quando tem ações. */
  as?: "nav" | "section";
  /** Linha de apoio embaixo do grupo. */
  footer?: ReactNode;
  children: ReactNode;
}

/** Grupo de linhas do Perfil: título e linhas separadas por divisórias numa caixa só. */
export function ProfileGroup({ id, title, as = "section", footer, children }: ProfileGroupProps) {
  const Tag = as;
  return (
    <Tag aria-labelledby={id} className="flex flex-col gap-2.5">
      <h2 id={id} className="type-section text-strong">
        {title}
      </h2>
      <div className="flex flex-col divide-y divide-line-subtle overflow-hidden rounded-md border border-line-subtle bg-card-white">
        {children}
      </div>
      {footer}
    </Tag>
  );
}
