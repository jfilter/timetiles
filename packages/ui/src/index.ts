/**
 * Main entry point for UI component library.
 *
 * Re-exports all commonly used components for convenient imports.
 *
 * @module
 */

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
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/collapsible";
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
export { HeaderDecorative } from "./components/header-decorative";
export { HeaderNav, HeaderNavItem } from "./components/header-nav";
export { Hero, HeroActions, HeroHeadline, HeroSubheadline } from "./components/hero";
export { Input } from "./components/input";
export { Label, labelVariants } from "./components/label";
export {
  MobileNavDrawer,
  MobileNavDrawerContent,
  MobileNavDrawerItem,
  MobileNavDrawerLink,
  MobileNavDrawerOverlay,
  MobileNavDrawerTrigger,
} from "./components/mobile-nav-drawer";
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
export { Stat, StatLabel, Stats, StatsGrid, StatValue } from "./components/stats";
export {
  TestimonialAuthor,
  TestimonialAvatar,
  TestimonialCard,
  TestimonialMeta,
  TestimonialQuote,
  Testimonials,
} from "./components/testimonials";
export { Timeline, TimelineDate, TimelineDescription, TimelineItem, TimelineTitle } from "./components/timeline";
