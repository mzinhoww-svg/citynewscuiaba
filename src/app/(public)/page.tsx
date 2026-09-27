import { SITE } from "@/content/pt-BR/site";

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-page flex-col gap-3 px-gutter py-10">
      <h1 className="type-display text-strong">{SITE.name}</h1>
      <p className="type-body-read text-meta">{SITE.description}</p>
    </div>
  );
}
