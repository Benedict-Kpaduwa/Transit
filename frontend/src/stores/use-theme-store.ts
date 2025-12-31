import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light" | "system";

interface ThemeState {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
}

// Get resolved theme (actual theme after resolving "system")
const getResolvedTheme = (theme: Theme): "dark" | "light" => {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
};

// Apply theme to document
const applyTheme = (theme: Theme) => {
  const root = window.document.documentElement;
  root.classList.remove("light", "dark");

  const resolvedTheme = getResolvedTheme(theme);
  root.classList.add(resolvedTheme);
  
  return resolvedTheme;
};

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      resolvedTheme: typeof window !== "undefined" ? getResolvedTheme("system") : "dark",
      setTheme: (theme: Theme) => {
        const resolvedTheme = applyTheme(theme);
        set({ theme, resolvedTheme });
      },
    }),
    {
      name: "ui-theme",
      onRehydrateStorage: () => (state) => {
        // Apply theme after rehydration from localStorage
        if (state) {
          const resolvedTheme = applyTheme(state.theme);
          // Update resolvedTheme in case system preference changed
          useTheme.setState({ resolvedTheme });
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
      const resolvedTheme = applyTheme(state?.theme || "system");
      useTheme.setState({ resolvedTheme });
    } catch {
      const resolvedTheme = applyTheme("system");
      useTheme.setState({ resolvedTheme });
    }
  } else {
    const resolvedTheme = applyTheme("system");
    useTheme.setState({ resolvedTheme });
  }

  // Listen for system theme changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const currentTheme = useTheme.getState().theme;
    if (currentTheme === "system") {
      const resolvedTheme = applyTheme("system");
      useTheme.setState({ resolvedTheme });
    }
  });
}
