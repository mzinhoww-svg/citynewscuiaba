import { HOME } from "@/content/pt-BR/portal";

/** Esqueleto das páginas públicas enquanto os dados chegam (docs/screens.md, estado loading). */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex w-full max-w-page flex-col gap-6 px-gutter py-10 motion-safe:animate-pulse"
    >
      <p className="sr-only">{HOME.loading}</p>
      <div className="aspect-video w-full max-w-3xl bg-section" />
      <div className="h-10 w-3/4 max-w-2xl bg-section" />
      <div className="h-5 w-1/2 max-w-xl bg-section" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-32 bg-section" />
        <div className="h-32 bg-section" />
        <div className="h-32 bg-section" />
      </div>
    </div>
  );
}
