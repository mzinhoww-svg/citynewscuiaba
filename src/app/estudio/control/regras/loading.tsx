import { StudioLoading } from "@/components";
import { RULES_ADMIN_TEXT } from "@/content/pt-BR/control-rules";

export default function Loading() {
  return <StudioLoading label={RULES_ADMIN_TEXT.loading} />;
}
