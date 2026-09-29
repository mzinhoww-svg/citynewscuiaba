import { StudioLoading } from "@/components";
import { ADMIN_OPS } from "@/content/pt-BR/admin-ops";

export default function Loading() {
  return <StudioLoading label={ADMIN_OPS.seo.loading} />;
}
