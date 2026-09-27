import type { Role } from "@/lib/auth";

export const STUDIO_TEXT = {
  name: "Estúdio",
  nav: "Estúdio",
  signedInAs: "Conectado como",
  welcome: "Bem-vindo ao Estúdio",
  intro:
    "Redação, Control Center e Governança ficam aqui. As telas chegam nas próximas fases; a navegação lateral mostra só o que o seu papel permite.",
  backToSite: "Ver o portal",
} as const;

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administração",
  editor_chefe: "Editor-chefe",
  editor: "Editor",
  jornalista: "Jornalista",
  revisor: "Revisor",
  operador_ia: "Operador de IA",
  analista: "Analista",
  moderador: "Moderador",
  leitura: "Leitura",
};
