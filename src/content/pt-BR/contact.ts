/**
 * Telefone e WhatsApp oficiais do CityNews (R42, decisão do dono, rodada 3). Um só lugar: Contato,
 * Anuncie, Sugerir evento, rodapé e JSON-LD leem daqui.
 */
export const PHONE = {
  display: "(65) 99622-7110",
  e164: "+5565996227110",
  schema: "+55-65-99622-7110",
  whatsapp: "https://wa.me/5565996227110",
} as const;

export const WHATSAPP_LABEL = `WhatsApp ${PHONE.display}`;
