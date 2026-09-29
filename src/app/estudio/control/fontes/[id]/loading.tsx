import { StudioLoading } from "@/components";
import { DETAIL } from "@/content/pt-BR/sources-admin-detail";

export default function Loading() {
  return <StudioLoading label={DETAIL.loading} />;
}
