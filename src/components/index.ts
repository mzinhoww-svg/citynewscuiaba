/*
 * Índice único dos componentes. Fora de src/components, importe sempre daqui
 * (`import { Button } from "@/components"`); o ESLint bloqueia import de arquivo interno.
 */
export { cx } from "./cx";

export { Button, type ButtonProps, type ButtonVariant } from "./ui/Button";
export { Icon, ICON_NAMES, type IconName, type IconProps } from "./ui/Icon";
export { NavLink, isCurrentPath, type NavLinkProps } from "./ui/NavLink";
export { TabBar, DEFAULT_TABS, type TabBarItem, type TabBarProps } from "./ui/TabBar";
export { VisuallyHidden } from "./ui/VisuallyHidden";

export { BottomNav, type BottomNavProps } from "./editorial/BottomNav";
export { LiveIndicator, type LiveIndicatorProps } from "./editorial/LiveIndicator";
export { Logo, type LogoCity, type LogoProps } from "./editorial/Logo";
export { SiteFooter, type SiteFooterProps } from "./editorial/SiteFooter";
export { SiteHeader, type SiteHeaderProps } from "./editorial/SiteHeader";

export {
  StudioShell,
  type StudioNavGroup,
  type StudioNavItem,
  type StudioShellProps,
  type StudioUser,
} from "./studio/StudioShell";
