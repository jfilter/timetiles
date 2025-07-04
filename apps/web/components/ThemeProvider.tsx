"use client";
import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({
  theme: "system",
  setTheme: (theme: "light" | "dark" | "system") => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<"light" | "dark" | "system">("system");

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark" || saved === "system") {
      setThemeState(saved);
    }
  }, []);

  useEffect(() => {
    // Apply theme to <html>
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    let applied = theme;
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      applied = mq.matches ? "dark" : "light";
    }
    root.classList.add(applied);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const setTheme = (t: "light" | "dark" | "system") => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
