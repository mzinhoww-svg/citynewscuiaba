import { StudioLoading } from "@/components";
import { CONTINGENCY } from "@/content/pt-BR/contingency";

export default function Loading() {
  return <StudioLoading label={CONTINGENCY.loading} />;
}
