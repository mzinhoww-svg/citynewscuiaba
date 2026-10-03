/*
 * Índice único dos componentes. Fora de src/components, importe sempre daqui
 * (`import { Button } from "@/components"`); o ESLint bloqueia import de arquivo interno.
 */
export { cx } from "./cx";

/* ui: primitivas de interface */
export { BottomSheet, type BottomSheetProps } from "./ui/BottomSheet";
export { Button, type ButtonProps, type ButtonVariant } from "./ui/Button";
export { Chip, ChipGroup, type ChipGroupProps, type ChipProps } from "./ui/Chip";
export { Dialog, type DialogProps } from "./ui/Dialog";
export { EmptyState, type EmptyStateProps } from "./ui/EmptyState";
export { Icon, type IconName, type IconProps } from "./ui/Icon";
export { ICON_NAMES } from "./ui/icon-names";
export { IconSprite } from "./ui/IconSprite";
export { IconButton, type IconButtonProps } from "./ui/IconButton";
export { InlineAlert, type InlineAlertProps } from "./ui/InlineAlert";
export { ListRow, type ListRowProps } from "./ui/ListRow";
export { NavHeader, type NavHeaderProps } from "./ui/NavHeader";
export { NavLink, isCurrentPath, type NavLinkProps } from "./ui/NavLink";
export { SearchBar, type SearchBarProps } from "./ui/SearchBar";
export { SectionHeader, type SectionHeaderProps } from "./ui/SectionHeader";
export { Select, type SelectOption, type SelectProps } from "./ui/Select";
export {
  SegmentedToggle,
  type SegmentedToggleOption,
  type SegmentedToggleProps,
} from "./ui/SegmentedToggle";
export { Skeleton, type SkeletonProps } from "./ui/Skeleton";
export { Slider, type SliderProps } from "./ui/Slider";
export { TabBar, DEFAULT_TABS, type TabBarItem, type TabBarProps } from "./ui/TabBar";
export { Tabs, type TabsProps } from "./ui/Tabs";
export { TextField, type TextFieldProps } from "./ui/TextField";
export { Toggle, type ToggleProps } from "./ui/Toggle";
export { VisuallyHidden } from "./ui/VisuallyHidden";

/* editorial: notícia, descoberta e marca */
export { AggregatedCard, type AggregatedCardProps } from "./editorial/AggregatedCard";
export { AggregatedSection, type AggregatedSectionProps } from "./editorial/AggregatedSection";
export { AgendaList, type AgendaItem, type AgendaListProps } from "./editorial/AgendaList";
export { EventCard, type EventCardProps } from "./editorial/EventCard";
export { RecurringDates, type RecurringDatesProps } from "./editorial/RecurringDates";
export { SaveEventButton, type SaveEventButtonProps } from "./editorial/SaveEventButton";
export { ArticleCard, ArticleThumb, type ArticleCardProps } from "./editorial/ArticleCard";
export {
  FilterBar,
  type FilterBarProps,
  type FilterField,
  type FilterOption,
} from "./editorial/FilterBar";
export { ArticleActionBar, type ArticleActionBarProps } from "./editorial/ArticleActionBar";
export { BarChart, type BarChartProps } from "./editorial/BarChart";
export { BottomNav, type BottomNavProps } from "./editorial/BottomNav";
export { CategoryTag, type CategoryTagProps } from "./editorial/CategoryTag";
export { CollectionCard, type CollectionCardProps } from "./editorial/CollectionCard";
export { EventDateBadge, type EventDateBadgeProps } from "./editorial/EventDateBadge";
export { FeatureCard, type FeatureCardProps } from "./editorial/FeatureCard";
export { LiveIndicator, type LiveIndicatorProps } from "./editorial/LiveIndicator";
export { Logo, type LogoCity, type LogoProps } from "./editorial/Logo";
export { MadeHow, type MadeHowProps } from "./editorial/MadeHow";
export { MetaRow, type MetaRowProps } from "./editorial/MetaRow";
export { NewsCard, type NewsCardProps } from "./editorial/NewsCard";
export { NewItemsPill, type NewItemsPillProps } from "./editorial/NewItemsPill";
export { NewsletterForm, type NewsletterFormProps } from "./editorial/NewsletterForm";
export { NowList, type NowListProps } from "./editorial/NowList";
export { OriginLabel, type OriginLabelProps } from "./editorial/OriginLabel";
export { Photo, type PhotoProps } from "./editorial/Photo";
export { ArticleFigure, type ArticleFigureProps } from "./editorial/ArticleFigure";
export {
  SectionFiltersForm,
  activeFilterCount,
  type SectionFiltersFormProps,
} from "./editorial/SectionFiltersForm";
export { ServiceTile, type ServiceTileProps } from "./editorial/ServiceTile";
export { Highlight, type HighlightProps } from "./editorial/Highlight";
export { SearchBox, type SearchBoxProps } from "./editorial/SearchBox";
export { SearchFiltersBar, type SearchFiltersBarProps } from "./editorial/SearchFiltersBar";
export {
  SearchGroupBlock,
  SearchResultItem,
  type SearchGroupBlockProps,
  type SearchResultItemProps,
} from "./editorial/SearchResults";
export { PublicShell, type PublicShellProps } from "./editorial/PublicShell";
export { AccountShell, type AccountShellProps } from "./editorial/AccountShell";
export { SignInForm, type SignInFormProps } from "./editorial/SignInForm";
export { SignUpForm, type SignUpFormProps } from "./editorial/SignUpForm";
export { EmailLinkForm, type EmailLinkFormProps } from "./editorial/EmailLinkForm";
export { NewPasswordForm, type NewPasswordFormProps } from "./editorial/NewPasswordForm";
export { ConfirmEmail, type ConfirmEmailProps } from "./editorial/ConfirmEmail";
export { MigrateLocal, type MigrateLocalProps } from "./editorial/MigrateLocal";
export { RecommendationControls } from "./editorial/RecommendationControls";
export { ClearOfflineButton } from "./editorial/ClearOfflineButton";
export { InstallInvite } from "./editorial/InstallInvite";
export { InstallInviteSlot } from "./editorial/InstallInviteSlot";
export { IosInstallSteps, type IosInstallStepsProps } from "./editorial/IosInstallSteps";
export { NotificationInvite, type NotificationInviteProps } from "./editorial/NotificationInvite";
export {
  NotificationInviteSlot,
  type NotificationInviteSlotProps,
} from "./editorial/NotificationInviteSlot";
export { OfflineNotice, type OfflineNoticeProps } from "./editorial/OfflineNotice";
export { PushSettings, type PushSettingsProps } from "./editorial/PushSettings";
export { PushSync } from "./editorial/PushSync";
export { SwRegistrar } from "./editorial/SwRegistrar";
export { LocalProfileCard, type LocalProfileCardProps } from "./editorial/LocalProfileCard";
export {
  DeleteAccount,
  ExportAccountButton,
  ProfileDetailsForm,
  type DeleteAccountProps,
  type ProfileDetailsFormProps,
} from "./editorial/AccountForms";
export {
  GoneState,
  NotFoundState,
  SystemState,
  type SystemStateProps,
} from "./editorial/SystemState";
export { ErrorState, type ErrorStateProps } from "./editorial/ErrorState";
export { LazyErrorState } from "./editorial/LazyErrorState";
export { RightOfReplyForm, type RightOfReplyFormProps } from "./editorial/RightOfReplyForm";
export { DocPage, type DocPageProps } from "./editorial/DocPage";
export { JsonLd, type JsonLdProps } from "./editorial/JsonLd";
export { SectionTile, type SectionTileProps } from "./editorial/SectionTile";
export { SiteFooter, type SiteFooterProps } from "./editorial/SiteFooter";
export { SiteHeader, type SiteHeaderProps } from "./editorial/SiteHeader";
export { SourceAvatar, type SourceAvatarProps } from "./editorial/SourceAvatar";
export { BrokenLinkReport, type BrokenLinkReportProps } from "./editorial/BrokenLinkReport";
export { SourceFollow, type SourceFollowProps } from "./editorial/SourceFollow";
export { SaveButton, type SaveButtonProps } from "./editorial/SaveButton";
export { ArticleActions, type ArticleActionsProps } from "./editorial/ArticleActions";
export { FollowTopicButton, type FollowTopicButtonProps } from "./editorial/FollowTopicButton";
export { AlertWatcher } from "./editorial/AlertWatcher";
export {
  CoverageCompare,
  type CoverageColumn,
  type CoverageCompareProps,
} from "./editorial/CoverageCompare";

/* fontes em destaque (P2-T6, DESIGN.md §6) */
export { DismissMenu, type DismissMenuProps } from "./editorial/DismissMenu";
export { SectionTabs, type SectionTabsProps } from "./editorial/SectionTabs";
export { Rail, type RailProps } from "./editorial/Rail";
export { PopularSourcesRail, type PopularSourcesRailProps } from "./editorial/PopularSourcesRail";
export {
  RecommendationReason,
  type RecommendationReasonProps,
} from "./editorial/RecommendationReason";
export {
  FollowButton,
  SourceBadges,
  SourceCard,
  type FollowHandler,
  type HideHandler,
  type SourceCardData,
  type SourceCardProps,
} from "./editorial/SourceCard";
export { SourceRow, type SourceRowProps } from "./editorial/SourceRow";
export { StatCard, type StatCardProps } from "./editorial/StatCard";
export { StoryCard, type StoryCardProps } from "./editorial/StoryCard";
export { TopicCard, type TopicCardProps } from "./editorial/TopicCard";
export { TopicSummaryCard, type TopicSummaryCardProps } from "./editorial/TopicSummaryCard";
export { TopicStatus, type TopicStatusProps } from "./editorial/TopicStatus";
export { UrgentBar, type UrgentBarProps } from "./editorial/UrgentBar";
export { VideoLowerThird, type VideoLowerThirdProps } from "./editorial/VideoLowerThird";

export { AiSummaryBlock, type AiSummaryBlockProps } from "./editorial/AiSummaryBlock";
export { CorrectionNote, UpdateNote, type NoteProps } from "./editorial/ArticleNotes";
export { ReadingProgress, type ReadingProgressProps } from "./editorial/ReadingProgress";
export { ReadingSettings } from "./editorial/ReadingSettings";
export { ReadTracker, type ReadTrackerProps } from "./editorial/ReadTracker";
export { ConsentBanner } from "./editorial/ConsentBanner";
export { KeepFocusInView } from "./editorial/KeepFocusInView";
export { ConsentChoices } from "./editorial/ConsentChoices";
export { PrivacyPreferences } from "./editorial/PrivacyPreferences";
export { ReportProblemForm, type ReportProblemFormProps } from "./editorial/ReportProblemForm";
export { ShareSheet, type ShareSheetProps } from "./editorial/ShareSheet";
export { SourcesList, type SourcesListProps } from "./editorial/SourcesList";
export {
  UpdatedWhileReading,
  type UpdatedWhileReadingProps,
} from "./editorial/UpdatedWhileReading";
export { VersionDiff, type VersionDiffProps } from "./editorial/VersionDiff";

export { Timeline, type TimelineProps } from "./editorial/Timeline";
export { TopicCoverage, type TopicCoverageProps } from "./editorial/TopicCoverage";
export { TopicFaq, type TopicFaqProps } from "./editorial/TopicFaq";

export {
  AgendaCalendar,
  type AgendaCalendarProps,
  type CalendarDay,
} from "./editorial/AgendaCalendar";

export {
  EventSuggestionForm,
  type EventSuggestionFormProps,
} from "./editorial/EventSuggestionForm";

/* ai: busca com IA (P13) */
export { AiAnswer, type AiAnswerProps } from "./ai/AiAnswer";
export { AiStatusPanel, type AiStatusPanelProps } from "./ai/AiStatusPanel";
export { AnswerFeedback } from "./ai/AnswerFeedback";
export { Citation, type CitationProps } from "./ai/Citation";
export { SourceRail, type SourceRailProps } from "./ai/SourceRail";
export { SuggestionChip, type SuggestionChipProps } from "./ai/SuggestionChip";

// Painel de fontes · cadastro e detalhe O04 (FS-T8)

// Aprovações de mudança crítica (P5-T1)

// Contingência A15 (P5-T10)

// Regras de autonomia O05 (P5-T2)

// Administração (P5-T8)
