import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

// Apply theme to document
const applyTheme = (theme: Theme) => {
  const root = window.document.documentElement;
  root.classList.remove("light", "dark");

  if (theme === "system") {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
      .matches
      ? "dark"
      : "light";
    root.classList.add(systemTheme);
  } else {
    root.classList.add(theme);
  }
};

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme: Theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: "ui-theme",
      onRehydrateStorage: () => (state) => {
        // Apply theme after rehydration from localStorage
        if (state) {
          applyTheme(state.theme);
        }
      },
    }
  )
);

// Initialize theme on first load
if (typeof window !== "undefined") {
  const stored = localStorage.getItem("ui-theme");
  if (stored) {
    try {
      const { state } = JSON.parse(stored);
      applyTheme(state?.theme || "system");
    } catch {
      applyTheme("system");
    }
  } else {
    applyTheme("system");
  }
}
