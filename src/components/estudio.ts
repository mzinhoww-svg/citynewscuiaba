/*
 * Índice dos componentes do Estúdio e do Control Center (redação, administração).
 * Fica fora de `@/components` para o bundle das páginas públicas não carregar o editor, o painel
 * de fontes e os esquemas de formulário do Estúdio (B-018). Importe daqui só em `src/app/estudio`.
 */
export {
  StudioShell,
  type StudioNavGroup,
  type StudioNavItem,
  type StudioShellProps,
  type StudioUser,
} from "./studio/StudioShell";
export { NotificationBell, type NotificationBellProps } from "./studio/NotificationBell";
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
export {
  ForcedPublishDialog,
  type ExcludedItem,
  type ForcedPublishApi,
  type ForcedPublishDialogProps,
  type ForcedSelectionPayload,
  type PreviewReply,
  type StartReply,
  type StatusReply,
} from "./studio/ForcedPublishDialog";
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
  type PublishReply,
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
export { EditorialScore, type EditorialScoreProps } from "./studio/sources/EditorialScore";
export { FrequencyLabel, type FrequencyLabelProps } from "./studio/sources/FrequencyLabel";
export { HealthBadge, type HealthBadgeProps } from "./studio/sources/HealthBadge";
export { SourceStatusBadge, type SourceStatusBadgeProps } from "./studio/sources/SourceStatusBadge";
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
export { ApprovalBanner, type ApprovalBannerProps } from "./studio/ApprovalBanner";
export { ApprovalInbox, type ApprovalInboxProps, type ApprovalReply } from "./studio/ApprovalInbox";
export {
  ContingencyPanel,
  type ContingencyCard,
  type ContingencyPanelProps,
  type ContingencyReply,
} from "./studio/ContingencyPanel";
export {
  SwitchBoard,
  type SwitchBoardProps,
  type SwitchCard,
  type SwitchReply,
} from "./studio/SwitchBoard";
export { RuleMatrix, type RuleMatrixProps } from "./studio/RuleMatrix";
export {
  RuleProposalForm,
  type ProposalReply,
  type RuleProposalFormProps,
  type RuleSetDraft,
  type SimulationView,
} from "./studio/RuleProposalForm";
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
export { PushHomeCard, type PushHomeCardProps } from "./studio/push/PushHomeCard";
export { StaffUrgentOptIn, type StaffUrgentOptInProps } from "./studio/push/StaffUrgentOptIn";
export { PushBanners, type PushBannersProps } from "./studio/push/PushBanners";
export { PushPreview, type PushPreviewProps } from "./studio/push/PushPreview";
export { ArticlePicker, type ArticlePickerProps } from "./studio/push/ArticlePicker";
export {
  AudienceField,
  type AudienceFieldProps,
  type ReachState,
} from "./studio/push/AudienceField";
export { NewPushForm, type NewPushFormProps } from "./studio/push/NewPushForm";
export { PauseDialog, type PauseDialogProps } from "./studio/push/PauseDialog";
export { PushSettingsForm, type PushSettingsFormProps } from "./studio/push/PushSettingsForm";
export { DecideDialog, type DecideDialogProps, type DecideMode } from "./studio/push/DecideDialog";
export { PushQueueTable, type PushQueueTableProps } from "./studio/push/PushQueueTable";
export {
  PushHistoryTable,
  historyQuery,
  type PushHistoryTableProps,
} from "./studio/push/PushHistoryTable";
export { PushTimeline, type PushTimelineProps } from "./studio/push/PushTimeline";
export {
  PushBreakdown,
  breakdownSummary,
  type PushBreakdownProps,
} from "./studio/push/PushBreakdown";
export { PushStatusBadge, type PushStatusBadgeProps } from "./studio/push/PushStatusBadge";
export {
  PushTabsNav,
  PUSH_TABS,
  type PushTabKey,
  type PushTabsNavProps,
} from "./studio/push/PushTabsNav";
export { FunnelChart, type FunnelChartProps } from "./studio/push/FunnelChart";
export {
  ActionMessage,
  CheckboxField,
  FieldShell,
  NativeSelect,
  SelectField,
  TextInput,
} from "./studio/sources/fields";
export {
  AgentTable,
  type AgentEditInput,
  type AgentItem,
  type AgentTableProps,
} from "./studio/AgentTable";
export { ModelTable, type ModelItem, type ModelTableProps } from "./studio/ModelTable";
export {
  PromptVersions,
  type PromptReply,
  type PromptVersionItem,
  type PromptVersionsProps,
} from "./studio/PromptVersions";
export {
  Playground,
  type PlaygroundAgentOption,
  type PlaygroundProps,
  type PlaygroundReply,
} from "./studio/Playground";
export { WeightSliders, type RecReply, type WeightSlidersProps } from "./studio/WeightSliders";
export {
  WeightsHistory,
  type WeightsHistoryItem,
  type WeightsHistoryProps,
} from "./studio/WeightsHistory";
export { WhyThisDrawer, type WhyReply, type WhyThisDrawerProps } from "./studio/WhyThisDrawer";
export { ShareChart, type ShareChartProps } from "./studio/ShareChart";
export {
  CampaignForm,
  ExperimentForm,
  type CampaignFormProps,
  type ExperimentFormProps,
} from "./studio/RecForms";
export { AbTestCard, type AbTestCardProps } from "./studio/AbTestCard";
export {
  AdminStatus,
  AdminTable,
  CheckList,
  type AdminReply,
  type CheckOption,
} from "./studio/admin/AdminStatus";
export { StaffTable, type StaffTableProps } from "./studio/admin/StaffTable";
export { TeamsEditor, type TeamsEditorProps } from "./studio/admin/TeamsEditor";
export { TaxonomyPanel, type TaxonomyPanelProps } from "./studio/admin/TaxonomyPanel";
export { HomeModulesEditor, type HomeModulesEditorProps } from "./studio/admin/HomeModulesEditor";
export { FeaturedBoard, type FeaturedBoardProps } from "./studio/featured/FeaturedBoard";
export { PinForm, type PinFormProps } from "./studio/featured/PinForm";
export { PinHistory, type PinHistoryProps } from "./studio/featured/PinHistory";
export type {
  FeaturedApi,
  PinDurationChoice,
  PinPayload,
  SearchHit,
} from "./studio/featured/types";
export { CampaignsPanel, type CampaignsPanelProps } from "./studio/admin/CampaignsPanel";
export { SeoPanel, type SeoPanelProps } from "./studio/admin/SeoPanel";
export { AuditExplorer, type AuditExplorerProps } from "./studio/admin/AuditExplorer";
export { SecurityPanel, type SecurityPanelProps } from "./studio/admin/SecurityPanel";
export { SettingsForm, type SettingsFormProps } from "./studio/admin/SettingsForm";
export { ConfidenceMeter, type ConfidenceMeterProps } from "./studio/ConfidenceMeter";

/* Guia Cuiabá (admin) */
export { ProposalsPanel, type ProposalsPanelProps } from "./studio/guide/ProposalsPanel";
export { ListsPanel, type ListsPanelProps, type SponsorPayload } from "./studio/guide/ListsPanel";
export { VenuesPanel, type VenuePayload, type VenuesPanelProps } from "./studio/guide/VenuesPanel";
export {
  TemplatesPanel,
  type TemplatePayload,
  type TemplatesPanelProps,
} from "./studio/guide/TemplatesPanel";
export type {
  AdminList,
  AdminListItem,
  AdminProposal,
  AdminReport,
  AdminTemplate,
  AdminVenue,
  CategoryOption,
} from "./studio/guide/types";
export {
  ReviewerModeCard,
  type ReviewerModeCardProps,
  type ReviewerModeValue,
} from "./studio/ReviewerModeCard";
