/**
 * Main entry point for UI component library.
 *
 * Re-exports all commonly used components for convenient imports.
 *
 * @module
 */

// Provider
export { type UIConfig, UIProvider, useUIConfig } from "./provider";

// Core components used by BlockRenderer
export { Button } from "./components/button";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardLabel,
  CardSpec,
  CardSpecItem,
  CardTitle,
  cardVariants,
  CardVersion,
} from "./components/card";
export { Checkbox } from "./components/checkbox";
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/collapsible";
export type { ConfirmDialogProps } from "./components/confirm-dialog";
export { ConfirmDialog } from "./components/confirm-dialog";
export type { ContentStateProps } from "./components/content-state";
export { ContentState } from "./components/content-state";
export type { ColumnDef, DataTableProps } from "./components/data-table";
export { DataTable } from "./components/data-table";
export {
  Dialog,
  DialogClose,
  DialogContent,
  dialogContentVariants,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./components/dialog";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./components/dropdown-menu";
export type { EmptyStateProps } from "./components/empty-state";
export { EmptyState } from "./components/empty-state";
export type { ErrorMessageProps } from "./components/error-message";
export { ErrorMessage } from "./components/error-message";
export {
  Feature,
  FeatureDescription,
  FeatureIcon,
  Features,
  FeaturesDescription,
  FeaturesGrid,
  FeaturesHeader,
  FeaturesTitle,
  FeatureTitle,
} from "./components/features";
export {
  Footer,
  FooterBottom,
  FooterBottomContent,
  FooterBrand,
  FooterColumn,
  FooterContent,
  FooterCopyright,
  FooterLink,
  FooterLinks,
  FooterLogo,
  FooterSection,
  FooterSectionTitle,
  FooterTagline,
} from "./components/footer";
export { Header, headerVariants } from "./components/header";
export { HeaderActions } from "./components/header-actions";
export { HeaderBrand } from "./components/header-brand";
export { HeaderNav, HeaderNavItem } from "./components/header-nav";
export { Hero, HeroActions, HeroDescription, HeroHeadline, HeroSubheadline } from "./components/hero";
export { Input } from "./components/input";
export { Label, labelVariants } from "./components/label";
export type { LoadingStateProps } from "./components/loading-state";
export { LoadingState } from "./components/loading-state";
export {
  MobileNavDrawer,
  MobileNavDrawerContent,
  MobileNavDrawerItem,
  MobileNavDrawerLink,
  MobileNavDrawerOverlay,
  MobileNavDrawerTrigger,
} from "./components/mobile-nav-drawer";
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/table";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/tabs";

// Page blocks - generic CMS components
export {
  CallToAction,
  CallToActionActions,
  CallToActionDescription,
  CallToActionFootnote,
  CallToActionHeadline,
} from "./components/call-to-action";
export { DetailsGrid, DetailsIcon, DetailsItem, DetailsLabel, DetailsValue } from "./components/details-grid";
export { NewsletterCTA, newsletterCtaVariants } from "./components/newsletter-cta";
export { NewsletterForm } from "./components/newsletter-form";
export {
  TestimonialAuthor,
  TestimonialAvatar,
  TestimonialCard,
  TestimonialMeta,
  TestimonialQuote,
  Testimonials,
} from "./components/testimonials";
export { Timeline, TimelineDate, TimelineDescription, TimelineItem, TimelineTitle } from "./components/timeline";
