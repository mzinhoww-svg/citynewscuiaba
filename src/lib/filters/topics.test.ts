import { parseTopicListFilters, topicListHref } from "./topics";

it("lê situação, semana e editoria e descarta o inválido", () => {
  expect(
    parseTopicListFilters(new URLSearchParams("situacao=em-apuracao&semana=1&editoria=cidade")),
  ).toEqual({ state: "em_apuracao", week: true, section: "cidade" });
  expect(
    parseTopicListFilters(new URLSearchParams("situacao=xyz&semana=talvez&editoria=%3Cb%3E")),
  ).toEqual({ week: false });
});

it("monta links preservando os outros filtros", () => {
  const f = parseTopicListFilters(new URLSearchParams("situacao=confirmados&editoria=clima"));
  expect(topicListHref(f, { week: true })).toBe(
    "/assuntos?situacao=confirmados&semana=1&editoria=clima",
  );
  expect(topicListHref(f, { state: undefined })).toBe("/assuntos?editoria=clima");
  expect(topicListHref({ week: false })).toBe("/assuntos");
});
