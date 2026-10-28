/**
 * Header authentication UI component.
 *
 * Shows sign in button when logged out, user dropdown menu when logged in. The mobile
 * navigation drawer renders the same account links and sign out as drawer entries.
 *
 * @module
 * @category Components
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  MobileNavDrawerLink,
} from "@timetiles/ui";
import { Activity, LogOut, type LucideIcon, Package, Settings, Upload, User as UserIcon } from "lucide-react";
import NextLink from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ComponentProps } from "react";

import { localizePath } from "@/i18n/localize-path";
import { Link } from "@/i18n/navigation";
import { useSite } from "@/lib/context/site-context";
import { useLogoutMutation } from "@/lib/hooks/use-auth-mutations";
import { authKeys } from "@/lib/hooks/use-auth-queries";
import type { User } from "@/payload-types";

interface HeaderAuthProps {
  user: User | null;
}

interface AccountLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Payload dashboard lives outside the [locale] tree; the i18n Link would prefix /de/dashboard and 404. */
  outsideLocale?: boolean;
}

const useAccountLinks = (): AccountLink[] => {
  const { isDefaultSite } = useSite();
  const t = useTranslations("Common");
  const tHeader = useTranslations("Header");
  return [
    ...(isDefaultSite
      ? [
          { href: "/ingest", label: tHeader("importData"), icon: Upload },
          { href: "/account/imports", label: tHeader("importActivity"), icon: Activity },
          { href: "/account/data-packages", label: tHeader("dataPackages"), icon: Package },
        ]
      : []),
    { href: "/account/settings", label: tHeader("accountSettings"), icon: UserIcon },
    { href: "/dashboard", label: t("dashboard"), icon: Settings, outsideLocale: true },
  ];
};

/** Forwards the props and ref Radix `asChild` slots pass down, so menu and drawer semantics reach the anchor. */
const AccountLinkContent = ({ link, ...props }: { link: AccountLink } & Omit<ComponentProps<"a">, "href">) => {
  const Icon = link.icon;
  const LinkComponent = link.outsideLocale ? NextLink : Link;
  return (
    <LinkComponent href={link.href} {...props}>
      <Icon className="mr-2 h-4 w-4" />
      {link.label}
    </LinkComponent>
  );
};

const useHeaderLogout = () => {
  const queryClient = useQueryClient();
  const locale = useLocale();
  const logoutMutation = useLogoutMutation();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        // Clear client-side auth cache so the navbar updates immediately
        queryClient.setQueryData(authKeys.currentUser, { user: null });
        // Full page navigation re-renders server components with the cleared session;
        // the localized home keeps the user's language
        globalThis.location.href = localizePath("/", locale);
      },
    });
  };

  return { handleLogout, isPending: logoutMutation.isPending, isError: logoutMutation.isError };
};

const LogoutError = () => {
  const tHeader = useTranslations("Header");
  return (
    <p role="alert" className="text-destructive text-sm">
      {tHeader("logoutError")}
    </p>
  );
};

export const HeaderAuth = ({ user }: Readonly<HeaderAuthProps>) => {
  const t = useTranslations("Common");
  const accountLinks = useAccountLinks();
  const logout = useHeaderLogout();

  // Not logged in - show sign in button
  if (!user) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/login">{t("signIn")}</Link>
      </Button>
    );
  }

  // Build display name
  const getDisplayName = (): string => {
    if (user.firstName) {
      const lastName = user.lastName ?? "";
      return lastName ? `${user.firstName} ${lastName}` : user.firstName;
    }
    const emailPrefix = user.email.split("@")[0];
    return emailPrefix ?? "User";
  };

  const displayName = getDisplayName();
  const initials = user.firstName ? user.firstName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <div className="bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium">
              {initials}
            </div>
            <span className="hidden md:inline">{displayName}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="font-medium">{displayName}</span>
              <span className="text-muted-foreground text-xs font-normal">{user.email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {accountLinks.map((link) => (
            <DropdownMenuItem key={link.href} asChild>
              <AccountLinkContent link={link} className="cursor-pointer" />
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={logout.handleLogout}
            disabled={logout.isPending}
            className="text-destructive focus:text-destructive cursor-pointer"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {logout.isPending ? t("signingOut") : t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {logout.isError && <LogoutError />}
    </>
  );
};

/** Auth entries of the mobile navigation drawer: sign in, or the account links and sign out. */
export const MobileHeaderAuth = ({ user, pathname }: Readonly<HeaderAuthProps & { pathname: string }>) => {
  const t = useTranslations("Common");
  const accountLinks = useAccountLinks();
  const logout = useHeaderLogout();

  if (!user) {
    return (
      <MobileNavDrawerLink active={pathname === "/login"} asChild>
        <Link href="/login">{t("signIn")}</Link>
      </MobileNavDrawerLink>
    );
  }

  return (
    <>
      {accountLinks.map((link) => (
        <MobileNavDrawerLink key={link.href} active={pathname === link.href} asChild>
          <AccountLinkContent link={link} className="flex items-center" />
        </MobileNavDrawerLink>
      ))}
      <MobileNavDrawerLink asChild>
        <button
          type="button"
          onClick={(event) => {
            // Keep the drawer open: closing it unmounts this observer and drops the mutation's onSuccess.
            event.preventDefault();
            logout.handleLogout();
          }}
          disabled={logout.isPending}
          className="text-destructive flex w-full items-center text-left"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {logout.isPending ? t("signingOut") : t("signOut")}
        </button>
      </MobileNavDrawerLink>
      {logout.isError && <LogoutError />}
    </>
  );
};
