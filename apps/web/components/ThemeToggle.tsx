"use client";
import { useState, useRef, useEffect } from "react";

import { useTheme } from "../lib/hooks/useTheme";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    } else {
      document.removeEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const options = [
    { value: "light", label: "Light", icon: "🌞" },
    { value: "dark", label: "Dark", icon: "🌚" },
    { value: "system", label: "System", icon: "🖥️" },
  ];

  const current = options.find((o) => o.value === theme);

  return (
    <div className="relative w-28" ref={ref}>
      <button
        className="hover:bg-accent/50 flex w-full items-center justify-between gap-1 rounded px-3 py-2"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span>{current?.icon}</span>
          <span className="hidden truncate md:inline">{current?.label}</span>
        </span>
        <span className="ml-1 h-3 w-3 flex-shrink-0">
          <svg viewBox="0 0 10 6" fill="none" className="h-3 w-3">
            <path
              d="M1 1l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
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
                className={`hover:bg-accent/30 flex w-full items-center gap-2 rounded px-3 py-2 text-left ${
                  theme === o.value ? "font-bold" : ""
                }`}
                onClick={() => {
                  setTheme(o.value as "light" | "dark" | "system");
                  setOpen(false);
                }}
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
}
