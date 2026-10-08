/** Leituras públicas do portal (P1). Todas devolvem `Result<_, QueryError>` e nunca lançam. */
export {
  findPublicArticleId,
  getArticleBySlug,
  getArticleHistory,
  getArticleUpdatedAt,
  publicContentExists,
} from "./articles";
export { listAggregated } from "./aggregated";
export { listAlertItems } from "./alerts";
export { getEvent, listEvents } from "./events";
export { getHomeData } from "./home";
export { getCollectionBySlug, getExploreData } from "./explore";
export { listCorrections } from "./corrections";
export { listArticleEntries, listNewsEntries, listPageEntries, listTopicEntries } from "./seo";
export { countSectionSince, getSectionRef, listSection, type SectionPage } from "./sections";
export {
  getRecConfig,
  getSource,
  getSourceDetail,
  type SourceDetail,
  getSourceSignals,
  listSourceItems,
} from "./sources";
export { getTopicBySlug, getTopicTitle, listTopics } from "./topics";
export type * from "./types";
