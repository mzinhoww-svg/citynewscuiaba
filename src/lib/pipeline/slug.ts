import { fold } from "@/lib/text/fold";

/** Slug de URL: sem acento, minúsculo, hífens, até `max` caracteres sem cortar no meio do hífen. */
export function slugify(text: string, max = 80): string {
  const s = fold(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, max).replace(/-+$/g, "") || "assunto";
}
