import React from "react";
import { ThemeToggle } from "./ThemeToggle";

export function TopMenuBar() {
  return (
    <nav className="fixed left-1/2 top-6 z-50 flex h-14 w-[700px] -translate-x-1/2 items-center justify-between rounded-2xl border border-neutral-200/60 bg-white/50 px-8 shadow-lg backdrop-blur-md dark:border-neutral-800/60 dark:bg-neutral-900/50">
      <div className="select-none text-lg font-bold tracking-widest">Logo</div>
      <ul className="m-0 flex list-none gap-8 p-0">
        <li className="hover:text-primary cursor-pointer text-base font-medium transition-colors">
          Home
        </li>
        <li className="hover:text-primary cursor-pointer text-base font-medium transition-colors">
          About
        </li>
        <li className="hover:text-primary cursor-pointer text-base font-medium transition-colors">
          Services
        </li>
        <li className="hover:text-primary cursor-pointer text-base font-medium transition-colors">
          Contact
        </li>
      </ul>
      <ThemeToggle />
    </nav>
  );
}
