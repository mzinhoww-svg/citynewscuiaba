import { StudioLoading } from "@/components";
import { REC_TEXT } from "@/content/pt-BR/control-rec";

export default function Loading() {
  return (
    <div aria-busy="true">
      <StudioLoading label={REC_TEXT.loading} />
    </div>
  );
}
