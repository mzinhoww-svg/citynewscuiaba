import { Skeleton } from "@/components";
import { GUIDE } from "@/content/pt-BR/guide";

const CONTAINER = "mx-auto w-full max-w-page px-gutter";

/** Carregando o Guia: cabeçalho com o h1 e esqueleto das listas. */
export default function GuideLoading() {
  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
      <header className="flex flex-col gap-3 border-b border-line-strong pb-5">
        <h1 className="type-screen-title text-strong">{GUIDE.index.title}</h1>
        <Skeleton lines={1} className="max-w-md" />
      </header>
      <div
        aria-busy="true"
        aria-live="polite"
        className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2"
      >
        <p className="sr-only">{GUIDE.index.loading}</p>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} lines={3} />
        ))}
      </div>
    </div>
  );
}
