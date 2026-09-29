// Entrada no Estúdio pelos testes e2e do painel de fontes. Reexporta o auxiliar comum
// (`tests/e2e/studio.ts`): `loginAs(page, "helena", "/estudio/control/fontes")` entra pela tela
// de login e chega na rota pedida; `service()` é o cliente com service role para preparar dados.
export { loginAs, service, STAFF, tag, type Staff } from "../studio";
