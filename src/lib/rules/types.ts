export type Mode = "auto" | "auto_notify" | "review" | "blocked";

export interface CategoryRule {
  mode: Mode;
  minSources: number;
  requirePrimary: boolean;
  requireApprovedImage: boolean;
  minScore: number | null;
  summaryWords: number | null;
}

export interface RuleSet {
  version: number;
  forceReview: boolean;
  sensitiveTopics: string[];
  categories: Record<string, CategoryRule>;
}
