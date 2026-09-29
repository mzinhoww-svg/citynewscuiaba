/**
 * Editorias com página `/[editoria]` (0010_sections.sql; G12). Lista fixa porque o SW não
 * consulta o banco; o teste confere contra a migration e contra `SECTION_DESCRIPTION`.
 */
export const SW_SECTIONS = [
  "cidade",
  "politica",
  "economia",
  "cultura",
  "esportes",
  "entretenimento",
  "gastronomia",
  "servicos",
  "guia-cuiaba",
  "seguranca",
  "saude",
  "agenda",
  "clima",
  "mobilidade",
] as const;
