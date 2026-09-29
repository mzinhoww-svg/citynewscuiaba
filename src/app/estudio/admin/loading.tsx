import { StudioLoading } from "@/components";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";

export default function Loading() {
  return <StudioLoading label={STUDIO_TEXT.loading} />;
}
