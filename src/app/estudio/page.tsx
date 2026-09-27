import type { Metadata } from "next";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";

export const metadata: Metadata = { title: "Estúdio · CityNews Cuiabá" };

export default function StudioHomePage() {
  return (
    <section className="flex max-w-read flex-col gap-3">
      <h1 className="type-screen-title text-strong">{STUDIO_TEXT.welcome}</h1>
      <p className="type-body text-meta">{STUDIO_TEXT.intro}</p>
    </section>
  );
}
