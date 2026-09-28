import { StudioLoading } from "@/components";
import { APPROVALS_TEXT } from "@/content/pt-BR/approvals";

export default function Loading() {
  return <StudioLoading label={APPROVALS_TEXT.loading} />;
}
