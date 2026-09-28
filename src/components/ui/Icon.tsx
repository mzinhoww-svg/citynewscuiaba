import {
  Archive,
  Ban,
  CirclePause,
  Star,
  ArrowLeft,
  Navigation,
  Accessibility,
  Ticket,
  Link2,
  ThumbsDown,
  ChevronLeft,
  Download,
  CalendarDays,
  List,
  History,
  ArrowUp,
  Bell,
  BookOpen,
  Bookmark,
  Calendar,
  Camera,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Clock,
  Compass,
  Copy,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck,
  Flag,
  Flame,
  Gauge,
  Globe,
  Heart,
  House,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  MoveRight,
  Newspaper,
  Percent,
  Play,
  Plus,
  RefreshCw,
  Repeat2,
  Scale,
  Search,
  Settings,
  Share2,
  Shield,
  SlidersHorizontal,
  Sun,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Type,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { cx } from "../cx";

const ICONS = {
  archive: Archive,
  ban: Ban,
  "circle-pause": CirclePause,
  star: Star,
  "arrow-up": ArrowUp,
  history: History,
  list: List,
  "calendar-days": CalendarDays,
  download: Download,
  "chevron-left": ChevronLeft,
  "thumbs-down": ThumbsDown,
  link: Link2,
  ticket: Ticket,
  accessibility: Accessibility,
  navigation: Navigation,
  "arrow-left": ArrowLeft,
  bell: Bell,
  "book-open": BookOpen,
  bookmark: Bookmark,
  calendar: Calendar,
  camera: Camera,
  "chart-column": ChartColumn,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "circle-alert": CircleAlert,
  "circle-help": CircleHelp,
  clock: Clock,
  compass: Compass,
  copy: Copy,
  ellipsis: Ellipsis,
  "ellipsis-vertical": EllipsisVertical,
  "external-link": ExternalLink,
  eye: Eye,
  "eye-off": EyeOff,
  "file-check": FileCheck,
  flag: Flag,
  flame: Flame,
  gauge: Gauge,
  globe: Globe,
  heart: Heart,
  house: House,
  layers: Layers,
  "layout-dashboard": LayoutDashboard,
  lock: Lock,
  "log-out": LogOut,
  mail: Mail,
  "map-pin": MapPin,
  "message-circle": MessageCircle,
  moon: Moon,
  "move-right": MoveRight,
  newspaper: Newspaper,
  percent: Percent,
  play: Play,
  plus: Plus,
  "refresh-cw": RefreshCw,
  "repeat-2": Repeat2,
  scale: Scale,
  search: Search,
  settings: Settings,
  "share-2": Share2,
  shield: Shield,
  "sliders-horizontal": SlidersHorizontal,
  sun: Sun,
  "thumbs-up": ThumbsUp,
  "trending-down": TrendingDown,
  "trending-up": TrendingUp,
  type: Type,
  user: User,
  users: Users,
  x: X,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export interface IconProps {
  name: IconName;
  /** 16 em metadados, 20 em botões e linhas de lista, 24 em navegação e campos. */
  size?: 14 | 16 | 18 | 20 | 22 | 24;
  strokeWidth?: number;
  /** Cor CSS (use `var(--token)`); o padrão herda a cor do texto. */
  color?: string;
  /** Estado ativo preenchido (bookmark, heart): passe `currentColor`. */
  fill?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Ícone de contorno usado em toda a interface do CityNews (navegação, metadados, campos);
 * geometria Lucide com traço 1,5.
 *
 * ```tsx
 * <Icon name="search" size={24} color="var(--text-placeholder)" />
 * <Icon name="bookmark" fill="currentColor" />
 * ```
 * - `size` 16 em linhas de metadado, 20 em botões, 24 em navegação e campos.
 * - Estado ativo preenchido: passe `fill` (bookmark). Nunca use emoji como ícone.
 * - Sempre decorativo (`aria-hidden`): o nome acessível fica no controle que o contém.
 */
export function Icon({
  name,
  size = 24,
  strokeWidth = 1.5,
  color = "currentColor",
  fill = "none",
  className,
  style,
}: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      fill={fill}
      aria-hidden="true"
      focusable="false"
      className={cx("block shrink-0", className)}
      style={style}
    />
  );
}
