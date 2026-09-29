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
export { Icon, ICON_NAMES, type IconName, type IconProps } from "./ui/Icon";
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
export { ArticleCard, type ArticleCardProps } from "./editorial/ArticleCard";
export { ArticleActionBar, type ArticleActionBarProps } from "./editorial/ArticleActionBar";
export { BarChart, type BarChartProps } from "./editorial/BarChart";
export { BottomNav, type BottomNavProps } from "./editorial/BottomNav";
export { CategoryTag, type CategoryTagProps } from "./editorial/CategoryTag";
export { CollectionCard, type CollectionCardProps } from "./editorial/CollectionCard";
export { ConfidenceMeter, type ConfidenceMeterProps } from "./editorial/ConfidenceMeter";
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
export { FollowTopicButton, type FollowTopicButtonProps } from "./editorial/FollowTopicButton";
export { AlertWatcher } from "./editorial/AlertWatcher";
export {
  CoverageCompare,
  type CoverageColumn,
  type CoverageCompareProps,
} from "./editorial/CoverageCompare";

/* fontes em destaque (P2-T6, DESIGN.md §6) */
export { DismissMenu, type DismissMenuProps } from "./editorial/DismissMenu";
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

export { ConvergenceBlock, type ConvergenceBlockProps } from "./editorial/ConvergenceBlock";
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

/* studio */
export {
  StudioShell,
  type StudioNavGroup,
  type StudioNavItem,
  type StudioShellProps,
  type StudioUser,
} from "./studio/StudioShell";
export { KpiStrip, type KpiItem, type KpiStripProps } from "./studio/KpiStrip";
export { QueueTabs, type QueueTabItem, type QueueTabsProps } from "./studio/QueueTabs";
export { QueueFilters, type QueueFiltersProps } from "./studio/QueueFilters";
export {
  QueueTable,
  type ActionReply,
  type QueueStatus,
  type QueueTableProps,
  type QueueTableRow,
} from "./studio/QueueTable";
export { StudioLoading, type StudioLoadingProps } from "./studio/StudioLoading";
export {
  ChecklistPanel,
  type ChecklistPanelItem,
  type ChecklistPanelProps,
} from "./studio/ChecklistPanel";
export {
  AiSuggestionInline,
  type AiSuggestionInlineProps,
  type AiSuggestionItem,
  type SuggestionField as AiSuggestionField,
} from "./studio/AiSuggestionInline";
export {
  SourcesEditor,
  type SourceRole,
  type SourcesEditorItem,
  type SourcesEditorProps,
} from "./studio/SourcesEditor";
export { FieldDiff, type FieldDiffItem, type FieldDiffProps } from "./studio/FieldDiff";
export { DecisionPanel, type DecisionPanelProps } from "./studio/DecisionPanel";
export {
  ArticleEditor,
  type ArticleEditorProps,
  type EditorDraft,
  type OriginField,
  type SaveReply,
} from "./studio/ArticleEditor";
export { RichEditor, type RichEditorProps } from "./studio/editor/Editor";
export {
  VersionCompare,
  type VersionCompareField,
  type VersionCompareProps,
  type VersionDiffOp,
} from "./studio/VersionDiff";
export {
  PublishDialog,
  type PublishDestination,
  type PublishDialogProps,
} from "./studio/PublishDialog";
export { CorrectionForm, type CorrectionFormProps } from "./studio/CorrectionForm";
export { MediaThumb, type MediaThumbProps } from "./studio/MediaThumb";
export { MediaGrid, type MediaGridItem, type MediaGridProps } from "./studio/MediaGrid";
export { ImageApproval, type ImageApprovalProps } from "./studio/ImageApproval";
export { ImageTextForm, type ImageTextFormProps } from "./studio/ImageTextForm";
export {
  GenerateImageDrawer,
  type GenerateImageDrawerProps,
  type GenerateReply,
} from "./studio/GenerateImageDrawer";
export { LicenseActions, type LicenseActionsProps } from "./studio/LicenseActions";
export { SubmissionReview, type SubmissionReviewProps } from "./studio/SubmissionReview";
export { ReportResponder, type ReportResponderProps } from "./studio/ReportResponder";
export { SortHeader, useSort, type SortHeaderProps } from "./studio/SortHeader";
export {
  SourceHealthTable,
  type SourceHealthItem,
  type SourceHealthTableProps,
} from "./studio/SourceHealthTable";
export { CycleStrip, type CycleStripItem, type CycleStripProps } from "./studio/CycleStrip";
export { PhaseChart, type PhaseChartProps } from "./studio/PhaseChart";
export { JobTable, type JobRow, type JobTableProps } from "./studio/JobTable";
export {
  RunNowForm,
  ReprocessForm,
  type ControlReply,
  type RunNowFormProps,
  type ReprocessFormProps,
} from "./studio/RunControls";
export { LiveMonitor, type LiveData, type LiveMonitorProps } from "./studio/LiveMonitor";
export { usePolling, type PollingState } from "./studio/usePolling";
export { RunsTable, type RunsTableRow } from "./studio/RunsTable";
export {
  LogExplorer,
  type LogExplorerFilters,
  type LogExplorerProps,
  type LogExplorerRow,
} from "./studio/LogExplorer";
export { CostChart, type CostChartProps } from "./studio/CostChart";
export {
  EvalRunner,
  EvalCasesTable,
  type EvalCaseItem,
  type EvalCasesTableProps,
  type EvalReply,
  type EvalRunnerProps,
} from "./studio/EvalRunner";

/* studio · painel de fontes (FS-T6) */
export { EditorialScore, type EditorialScoreProps } from "./studio/sources/EditorialScore";
export { FrequencyLabel, type FrequencyLabelProps } from "./studio/sources/FrequencyLabel";
export { HealthBadge, type HealthBadgeProps } from "./studio/sources/HealthBadge";
export { SourceStatusBadge, type SourceStatusBadgeProps } from "./studio/sources/SourceStatusBadge";

/* studio · painel de fontes, lista O03 (FS-T7) */
export { BulkActionsBar, type BulkActionsBarProps } from "./studio/sources/BulkActionsBar";
export {
  BulkFrequencyDialog,
  type BulkFrequencyDialogProps,
} from "./studio/sources/BulkFrequencyDialog";
export {
  CollectionSettingsDialog,
  type CollectionSettingsDialogProps,
} from "./studio/sources/CollectionSettingsDialog";
export {
  FastLaneSkippedNotice,
  type FastLaneSkippedNoticeProps,
} from "./studio/sources/FastLaneSkippedNotice";
export {
  SourceApprovalsNotice,
  type SourceApprovalsNoticeProps,
} from "./studio/sources/SourceApprovalsNotice";
export { SourceFilters, type SourceFiltersProps } from "./studio/sources/SourceFilters";
export { SourceRowMenu, type SourceRowMenuProps } from "./studio/sources/SourceRowMenu";
export { SourceRowMobile, type SourceRowMobileProps } from "./studio/sources/SourceRowMobile";
export { SourcesTable, type SourcesTableProps } from "./studio/sources/SourcesTable";

// Painel de fontes · cadastro e detalhe O04 (FS-T8)
export {
  AddSourceWizard,
  type AddSourceWizardProps,
  type WizardAction,
  type WizardActionResult,
} from "./studio/sources/AddSourceWizard";
export { AnalysisProgress, type AnalysisProgressProps } from "./studio/sources/AnalysisProgress";
export {
  ApproveChangeDialog,
  type ApproveChangeDialogProps,
} from "./studio/sources/ApproveChangeDialog";
export { BlockSourceDialog, type BlockSourceDialogProps } from "./studio/sources/BlockSourceDialog";
export { CollectionActions, type CollectionActionsProps } from "./studio/sources/CollectionActions";
export {
  ConfirmByTypingDialog,
  type ConfirmByTypingDialogProps,
} from "./studio/sources/ConfirmByTypingDialog";
export {
  PendingApprovalsPanel,
  type PendingApprovalsPanelProps,
} from "./studio/sources/PendingApprovalsPanel";
export { SourceAuditTable, type SourceAuditTableProps } from "./studio/sources/SourceAuditTable";

// Aprovações de mudança crítica (P5-T1)
export { ApprovalBanner, type ApprovalBannerProps } from "./studio/ApprovalBanner";
export { ApprovalInbox, type ApprovalInboxProps, type ApprovalReply } from "./studio/ApprovalInbox";
export { SourceConfigForm, type SourceConfigFormProps } from "./studio/sources/SourceConfigForm";
export {
  SourceHeaderActions,
  type SourceHeaderActionsProps,
} from "./studio/sources/SourceHeaderActions";
export { SourceHealthPanel, type SourceHealthPanelProps } from "./studio/sources/SourceHealthPanel";
export { SourceLogoForm, type SourceLogoFormProps } from "./studio/sources/SourceLogoForm";
export { SourcePreviewList, type SourcePreviewListProps } from "./studio/sources/SourcePreviewList";
export { SourceRecForm, type SourceRecFormProps } from "./studio/sources/SourceRecForm";
export { SourceRunsTable, type SourceRunsTableProps } from "./studio/sources/SourceRunsTable";
export { SourceSectionNav, type SourceSectionNavProps } from "./studio/sources/SourceSectionNav";
export { SuggestionField, type SuggestionFieldProps } from "./studio/sources/SuggestionField";
