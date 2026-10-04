import type { IconName } from "../../ui/Icon";

/** Ação de um bloco de marketing: link com aparência de botão e nome acessível no texto. */
export interface MarketingAction {
  label: string;
  href: string;
  icon?: IconName;
}
