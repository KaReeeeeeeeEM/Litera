"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  function toggleTheme(event: React.MouseEvent<HTMLButtonElement>) {
    const nextTheme = isDark ? "light" : "dark";
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startViewTransition = (document as Document & { startViewTransition?: (callback: () => void) => void }).startViewTransition;

    if (!startViewTransition || reduceMotion) {
      setTheme(nextTheme);
      return;
    }

    const x = event.clientX;
    const y = event.clientY;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.documentElement.style.setProperty("--theme-x", `${x}px`);
    document.documentElement.style.setProperty("--theme-y", `${y}px`);
    document.documentElement.style.setProperty("--theme-radius", `${radius}px`);
    startViewTransition.call(document, () => setTheme(nextTheme));
  }

  return (
    <Button
      aria-label="Toggle color theme"
      onClick={toggleTheme}
      size="icon"
      variant="ghost"
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
