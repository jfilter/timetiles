/**
 * Theme toggle dropdown component.
 *
 * Provides a dropdown menu for switching between light, dark, and system
 * theme modes. Persists theme preference to localStorage and applies
 * appropriate CSS classes to the document root.
 *
 * @module
 * @category Components
 */
"use client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@workspace/ui";
import { ChevronDownIcon, Monitor, Moon, Sun } from "lucide-react";
import { useCallback } from "react";

import { useTheme } from "@/lib/hooks/use-theme";

const options = [
  { value: "light" as const, label: "Light", Icon: Sun },
  { value: "dark" as const, label: "Dark", Icon: Moon },
  { value: "system" as const, label: "System", Icon: Monitor },
];

const ThemeMenuItem = ({
  value,
  label,
  Icon,
  isActive,
  onClick,
}: {
  value: "light" | "dark" | "system";
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  onClick: (value: "light" | "dark" | "system") => void;
}) => {
  const handleClick = useCallback(() => onClick(value), [value, onClick]);

  return (
    <DropdownMenuItem onClick={handleClick} className={isActive ? "font-bold" : ""}>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </DropdownMenuItem>
  );
};

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  const current = options.find((o) => o.value === theme);

  const CurrentIcon = current?.Icon ?? Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-accent/50 flex w-28 items-center justify-between gap-1 rounded px-3 py-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <CurrentIcon className="h-4 w-4 flex-shrink-0" />
            <span className="hidden truncate md:inline">{current?.label}</span>
          </span>
          <ChevronDownIcon className="ml-1 h-3 w-3 flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-28">
        {options.map(({ value, label, Icon }) => (
          <ThemeMenuItem
            key={value}
            value={value}
            label={label}
            Icon={Icon}
            isActive={theme === value}
            onClick={setTheme}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
