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
export { ConfirmDialog, type ConfirmDialogProps } from "./ui/ConfirmDialog";
export { SubmitButton, type SubmitButtonProps } from "./ui/SubmitButton";
export { Drawer, type DrawerProps } from "./ui/Drawer";
export { Menu, type MenuItem, type MenuProps } from "./ui/Menu";
export {
  Popover,
  type PopoverControls,
  type PopoverProps,
  type PopoverTriggerProps,
  type PopoverTriggerRender,
} from "./ui/Popover";
export { EmptyState, type EmptyStateProps } from "./ui/EmptyState";
export { Icon, type IconName, type IconProps, type IconSize } from "./ui/Icon";
export { ICON_NAMES } from "./ui/icon-names";
export { IconSprite } from "./ui/IconSprite";
export { IconButton, type IconButtonProps } from "./ui/IconButton";
export { InlineAlert, type InlineAlertProps } from "./ui/InlineAlert";
export { Pagination, paginationSlots, type PaginationProps } from "./ui/Pagination";
export { Table, type TableHeader, type TableMinWidth, type TableProps } from "./ui/Table";
export { LoadMore, loadMoreAnchor, type LoadMoreProps } from "./ui/LoadMore";
export { ListRow, type ListRowProps } from "./ui/ListRow";
export { NavHeader, type NavHeaderProps } from "./ui/NavHeader";
export { NavLink, isCurrentPath, type NavLinkProps } from "./ui/NavLink";
export { Panel, type PanelProps } from "./ui/Panel";
export { SearchBar, type SearchBarProps } from "./ui/SearchBar";
export { CollapsibleFilters, type CollapsibleFiltersProps } from "./ui/CollapsibleFilters";
export { SectionHeader, type SectionHeaderProps } from "./ui/SectionHeader";
export {
  Select,
  SelectControl,
  type SelectControlProps,
  type SelectOption,
  type SelectOptionGroup,
  type SelectProps,
  type SelectSize,
} from "./ui/Select";
export { FieldShell, FieldError, describedBy, type FieldShellProps } from "./ui/Field";
export { TextArea, type TextAreaProps } from "./ui/TextArea";
export { DateField, type DateFieldProps } from "./ui/DateField";
export { Checkbox, type CheckboxProps } from "./ui/Checkbox";
export { RadioGroup, type RadioGroupProps, type RadioOption } from "./ui/RadioGroup";
export {
  SegmentedToggle,
  type SegmentedToggleOption,
  type SegmentedToggleProps,
} from "./ui/SegmentedToggle";
export { Skeleton, type SkeletonProps } from "./ui/Skeleton";
export { Slider, type SliderProps } from "./ui/Slider";
export { StatGrid, type StatGridItem, type StatGridProps } from "./ui/StatGrid";
export {
  StatusBadge,
  STATUS_TONE_CLASSES,
  type StatusBadgeProps,
  type StatusTone,
} from "./ui/StatusBadge";
export { TabBar, DEFAULT_TABS, type TabBarItem, type TabBarProps } from "./ui/TabBar";
export { Tabs, type TabsProps } from "./ui/Tabs";
export { TextField, type TextFieldProps } from "./ui/TextField";
export { Toggle, type ToggleProps } from "./ui/Toggle";
export { ToastProvider, useToast, type ToastApi, type ToastInput } from "./ui/Toast";
export { FormStatus, type FormStatusProps } from "./ui/FormStatus";
export { VisuallyHidden } from "./ui/VisuallyHidden";
export { TagLink, type TagLinkProps } from "./ui/TagLink";
export { LinkTabs, type LinkTabItem, type LinkTabsProps } from "./ui/LinkTabs";

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
export { CreditLine, type CreditLineProps } from "./editorial/CreditLine";
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
export { AdSlot, type AdSlotProps } from "./editorial/AdSlot";
export { AccountShell, type AccountShellProps } from "./editorial/AccountShell";
export { AccountInvite, type AccountInviteProps } from "./editorial/AccountInvite";
export {
  PAGE_CONTAINER,
  PageHeader,
  PageLoading,
  type PageHeaderProps,
  type PageLoadingProps,
} from "./editorial/PageHeader";
export { SignInForm, type SignInFormProps } from "./editorial/SignInForm";
export { EmailDivider, GoogleButton, type GoogleButtonProps } from "./editorial/GoogleButton";
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
export {
  BrowserDataDetails,
  BrowserExportRow,
  BrowserLossNote,
  EditProfile,
  ProfileActivityRows,
  type EditProfileProps,
} from "./editorial/ProfileSections";
export {
  ProfileGroup,
  ProfileIdentity,
  type ProfileGroupProps,
  type ProfileIdentityProps,
} from "./editorial/ProfileParts";
export {
  DeleteAccountForm,
  ExportAccountRow,
  ProfileDetailsForm,
  type DeleteAccountFormProps,
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
export {
  DocBreadcrumb,
  DocPage,
  DocRelated,
  filledSections,
  type DocPageProps,
} from "./editorial/DocPage";
export {
  Benefits,
  Cta,
  Faq,
  Hero,
  type BenefitItem,
  type BenefitsProps,
  type CtaProps,
  type FaqItem,
  type FaqProps,
  type HeroProps,
  type MarketingAction,
} from "./editorial/marketing";
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
export { ReviewBanner, type ReviewBannerProps } from "./editorial/ReviewBanner";
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
export { AskChatLazy } from "./ai/AskChatLazy";
export type { AskChatProps } from "./ai/AskChat";
export type { ChatComposerProps } from "./ai/ChatComposer";
export type { ChatMessageProps } from "./ai/ChatMessage";
export type { ChatSourcesProps } from "./ai/ChatSources";
export type { ChatThreadProps } from "./ai/ChatThread";
export { Citation, type CitationProps } from "./ai/Citation";
export { SourceRail, type SourceRailProps } from "./ai/SourceRail";
export { SuggestionChip, type SuggestionChipProps } from "./ai/SuggestionChip";

// Painel de fontes · cadastro e detalhe O04 (FS-T8)

// Aprovações de mudança crítica (P5-T1)

// Contingência A15 (P5-T10)

// Regras de autonomia O05 (P5-T2)

// Administração (P5-T8)

/* guia: listas e lugares de Cuiabá */
export { CriteriaNote, type CriteriaNoteProps } from "./editorial/guide/CriteriaNote";
export { ListCard, type ListCardProps } from "./editorial/guide/ListCard";
export { ReportVenueForm } from "./editorial/guide/ReportVenueForm";
export {
  VenueCard,
  categoryLabel,
  ratingText,
  type VenueCardProps,
} from "./editorial/guide/VenueCard";
export { VenueCover, type VenueCoverProps } from "./editorial/guide/VenueCover";
export { FirstVisitGate } from "./editorial/DeferredShell";
