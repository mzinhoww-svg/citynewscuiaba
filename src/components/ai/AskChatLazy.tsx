import dynamic from "next/dynamic";

/**
 * Chat do Pergunte ao CityNews (UI-T13) carregado à parte: o código do chat só baixa em
 * `/pergunte`. Continua renderizado no servidor (boas-vindas e campo aparecem sem esperar o JS).
 *
 * ```tsx
 * <AskChatLazy initialQuestion={q} />
 * ```
 */
export const AskChatLazy = dynamic(() => import("./AskChat").then((m) => m.AskChat));
