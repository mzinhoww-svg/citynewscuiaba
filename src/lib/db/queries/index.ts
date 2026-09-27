/** Leituras públicas do portal (P1). Todas devolvem `Result<_, QueryError>` e nunca lançam. */
export {
  ARTICLE_REVALIDATE,
  articleHref,
  articleTag,
  findPublicArticleId,
  getArticleBySlug,
  getArticleHistory,
  getArticleUpdatedAt,
  parseBody,
} from "./articles";
export { listAggregated, type AggregatedFilters } from "./aggregated";
export { getEvent, listEvents, eventHref, type EventFilters } from "./events";
export { getHomeData, HOME_SECTION_BLOCKS } from "./home";
export { getCollectionBySlug, getExploreData } from "./explore";
export { listCorrections } from "./corrections";
export {
  countSectionSince,
  getSectionRef,
  listSection,
  SECTION_PAGE_SIZE,
  type SectionFilters,
  type SectionPage,
} from "./sections";
export { getTopicBySlug, listTopics, topicHref, type TopicListFilters } from "./topics";
export type * from "./types";
