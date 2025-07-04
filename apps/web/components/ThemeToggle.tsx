"use client";
import { useTheme } from "../components/ThemeProvider";
import { useState, useRef, useEffect } from "react";

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
        className="flex w-full items-center gap-1 rounded px-3 py-2 hover:bg-accent/50 justify-between"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span>{current?.icon}</span>
          <span className="hidden md:inline truncate">{current?.label}</span>
        </span>
        <span className="flex-shrink-0 ml-1 h-3 w-3">
          <svg
            viewBox="0 0 10 6"
            fill="none"
            className="h-3 w-3"
          >
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
          className="absolute right-0 z-10 mt-2 w-28 rounded border bg-popover p-1 shadow-lg dark:bg-neutral-900"
          role="listbox"
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-accent/30 ${
                  theme === o.value ? "font-bold" : ""
                }`}
                onClick={() => {
                  setTheme(o.value as any);
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
