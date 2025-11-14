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
import { useCallback, useEffect, useRef, useState } from "react";

import { useTheme } from "@/lib/hooks/use-theme";

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleToggleOpen = useCallback(() => setOpen((v) => !v), []);

  const handleLightSelect = useCallback(() => {
    setTheme("light");
    setOpen(false);
  }, [setTheme]);

  const handleDarkSelect = useCallback(() => {
    setTheme("dark");
    setOpen(false);
  }, [setTheme]);

  const handleSystemSelect = useCallback(() => {
    setTheme("system");
    setOpen(false);
  }, [setTheme]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClick);
    } else {
      document.removeEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const options = [
    { value: "light", label: "Light", icon: "🌞", handler: handleLightSelect },
    { value: "dark", label: "Dark", icon: "🌚", handler: handleDarkSelect },
    { value: "system", label: "System", icon: "🖥️", handler: handleSystemSelect },
  ];

  const current = options.find((o) => o.value === theme);

  return (
    <div className="relative w-28" ref={ref}>
      <button
        type="button"
        className="hover:bg-accent/50 flex w-full items-center justify-between gap-1 rounded px-3 py-2"
        onClick={handleToggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span>{current?.icon}</span>
          <span className="hidden truncate md:inline">{current?.label}</span>
        </span>
        <span className="ml-1 h-3 w-3 flex-shrink-0">
          <svg viewBox="0 0 10 6" fill="none" className="h-3 w-3">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      {open && (
        <ul
          className="bg-popover absolute right-0 z-10 mt-2 w-28 rounded border p-1 shadow-lg dark:bg-neutral-900"
          role="listbox"
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className={`hover:bg-accent/30 flex w-full items-center gap-2 rounded px-3 py-2 text-left ${
                  theme === o.value ? "font-bold" : ""
                }`}
                onClick={o.handler}
                role="option"
                aria-selected={theme === o.value}
              >
                <span>{o.icon}</span>
                <span>{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
