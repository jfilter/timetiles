/**
 * Header authentication UI component.
 *
 * Shows sign in button when logged out, user dropdown menu when logged in.
 * User dropdown includes links to import data, admin dashboard, and sign out.
 *
 * @module
 * @category Components
 */
"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@timetiles/ui";
import { LogOut, Settings, Upload, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import type { User } from "@/payload-types";

interface HeaderAuthProps {
  user: User | null;
}

export const HeaderAuth = ({ user }: Readonly<HeaderAuthProps>) => {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = useCallback(() => {
    setIsLoggingOut(true);
    void (async () => {
      try {
        await fetch("/api/users/logout", {
          method: "POST",
          credentials: "include",
        });
        router.refresh();
        router.push("/");
      } catch {
        setIsLoggingOut(false);
      }
    })();
  }, [router]);

  // Not logged in - show sign in button
  if (!user) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/login">Sign In</Link>
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

        <DropdownMenuItem asChild>
          <Link href="/import" className="cursor-pointer">
            <Upload className="mr-2 h-4 w-4" />
            Import Data
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/account/settings" className="cursor-pointer">
            <UserIcon className="mr-2 h-4 w-4" />
            Account Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {isLoggingOut ? "Signing out..." : "Sign Out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
