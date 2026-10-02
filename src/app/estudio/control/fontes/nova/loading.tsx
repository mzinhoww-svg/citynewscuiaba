import { Skeleton } from "@/components";
import { WIZARD_TEXT } from "@/content/pt-BR/sources-admin-detail";

/** Esqueleto do assistente (cabeçalho, etapas e campo do endereço), `aria-busy`. */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p className="sr-only">{WIZARD_TEXT.title}</p>
      <div className="h-9 w-48 bg-section" />
      <div className="h-6 w-2/3 bg-section" />
      <div className="rounded-lg border border-line-section bg-card-white p-4">
        <Skeleton lines={3} />
      </div>
    </div>
  );
}
