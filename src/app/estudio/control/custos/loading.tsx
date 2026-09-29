import { StudioLoading } from "@/components";
import { AI_OPS_TEXT } from "@/content/pt-BR/control-ai-ops";

export default function Loading() {
  return <StudioLoading label={AI_OPS_TEXT.costsLoading} />;
}
