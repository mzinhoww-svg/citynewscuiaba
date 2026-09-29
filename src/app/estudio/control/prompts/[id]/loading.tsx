import { StudioLoading } from "@/components";
import { AI_ADMIN_TEXT } from "@/content/pt-BR/control-ai";

export default function Loading() {
  return <StudioLoading label={AI_ADMIN_TEXT.promptsLoading} />;
}
