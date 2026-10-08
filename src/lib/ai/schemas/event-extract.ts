import { z } from "zod";

/** Listagem de agenda: links das páginas de evento (até 30). */
export const eventListingSchema = z.object({ links: z.array(z.string().url()).max(30) });

/** Um campo extraído: valor, trecho literal da página que o sustenta e onde o ano aparece. */
export const fieldSchema = z.object({
  value: z.string().min(1).max(300),
  trecho: z.string().min(3).max(400),
  ano_evidencia: z.enum(["corpo", "url", "ausente"]),
});

/** Página de evento. `data.value` em YYYY-MM-DD, `horario.value` em HH:mm (conferidos pelo código). */
export const eventPageSchema = z.object({
  evento: z.boolean(),
  titulo: fieldSchema,
  data: fieldSchema,
  horario: fieldSchema.nullable(),
  local: fieldSchema.nullable(),
  cidade: fieldSchema.nullable(),
  preco: fieldSchema.nullable(),
  organizador: fieldSchema.nullable(),
  relativas: z.array(z.string()).max(5),
});

export type EventListing = z.infer<typeof eventListingSchema>;
export type EventPage = z.infer<typeof eventPageSchema>;
