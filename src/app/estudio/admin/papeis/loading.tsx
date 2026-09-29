import { StudioLoading } from "@/components";
import { ADMIN_TEXT } from "@/content/pt-BR/admin";

export default function Loading() {
  return <StudioLoading label={ADMIN_TEXT.loading} />;
}
