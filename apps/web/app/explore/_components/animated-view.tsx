/**
 * Animated wrapper and navigation for explore views.
 *
 * Provides fade-out-then-fade-in transitions when switching between
 * map and list views. Click triggers fade out, navigation happens
 * after fade completes, then new page fades in.
 *
 * Uses Zustand store to communicate between header (root layout) and
 * AnimatedView (explore layout).
 *
 * @module
 * @category Components
 */
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";

interface AnimatedNavigationStore {
  pendingNavigation: string | null;
  setPendingNavigation: (href: string | null) => void;
  isNavigating: boolean;
  setIsNavigating: (value: boolean) => void;
}

export const useAnimatedNavigationStore = create<AnimatedNavigationStore>((set) => ({
  pendingNavigation: null,
  setPendingNavigation: (href) => set({ pendingNavigation: href }),
  isNavigating: false,
  setIsNavigating: (value) => set({ isNavigating: value }),
}));

export const useAnimatedNavigation = () => {
  const setPendingNavigation = useAnimatedNavigationStore((s) => s.setPendingNavigation);

  return {
    navigateTo: (href: string) => {
      setPendingNavigation(href);
    },
  };
};

interface AnimatedViewProps {
  children: React.ReactNode;
}

const FADE_OUT_DURATION = 150;
const FADE_IN_DURATION = 250;

export const AnimatedView = ({ children }: AnimatedViewProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const pendingNavigation = useAnimatedNavigationStore((s) => s.pendingNavigation);
  const setPendingNavigation = useAnimatedNavigationStore((s) => s.setPendingNavigation);
  const isNavigating = useAnimatedNavigationStore((s) => s.isNavigating);
  const setIsNavigating = useAnimatedNavigationStore((s) => s.setIsNavigating);

  const [opacity, setOpacity] = useState(1);
  const [transition, setTransition] = useState(`opacity ${FADE_IN_DURATION}ms ease-out`);
  const [lastPathname, setLastPathname] = useState(pathname);

  // Handle fade out when navigation is requested
  useEffect(() => {
    if (pendingNavigation) {
      // Start fade out
      setTransition(`opacity ${FADE_OUT_DURATION}ms ease-in`);
      setOpacity(0);

      // Navigate after fade out completes, mark as navigating
      const navTimer = setTimeout(() => {
        setIsNavigating(true);
        router.push(pendingNavigation);
        setPendingNavigation(null);
      }, FADE_OUT_DURATION);

      return () => clearTimeout(navTimer);
    }
  }, [pendingNavigation, router, setPendingNavigation, setIsNavigating]);

  // Detect when pathname changes (navigation completed)
  useEffect(() => {
    if (pathname !== lastPathname) {
      setLastPathname(pathname);

      if (isNavigating) {
        // We just navigated - start invisible, then fade in
        setOpacity(0);
        setTransition("none"); // No transition for initial invisible state

        // After a frame, enable transition and fade in
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTransition(`opacity ${FADE_IN_DURATION}ms ease-out`);
            setOpacity(1);
            setIsNavigating(false);
          });
        });
      }
    }
  }, [pathname, lastPathname, isNavigating, setIsNavigating]);

  const style = useMemo(() => ({ opacity, transition }), [opacity, transition]);

  return <div style={style}>{children}</div>;
};
