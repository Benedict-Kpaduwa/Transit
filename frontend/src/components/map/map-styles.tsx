import React, { useState, useEffect } from "react";
import { MapIcon, SatelliteIcon, TreesIcon, Sun, Moon } from "lucide-react";
import { useMap } from "@/context/map-context";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "@/stores/use-theme-store";

type StyleOption = {
  id: string;
  label: string;
  icon: React.ReactNode;
  baseStyle?: string; // Base style without theme suffix
};

// These styles support light/dark variants
const THEME_AWARE_STYLES = ["default", "streets"];

const STYLE_OPTIONS: StyleOption[] = [
  {
    id: "default",
    label: "Default",
    icon: <MapIcon className="w-4 h-4 sm:mr-2" />,
    baseStyle: "default",
  },
  {
    id: "satellite-streets-v12",
    label: "Satellite",
    icon: <SatelliteIcon className="w-4 h-4 sm:mr-2" />,
  },
  {
    id: "outdoors-v12",
    label: "Terrain",
    icon: <TreesIcon className="w-4 h-4 sm:mr-2" />,
  },
];

export default function MapStyles() {
  const { map } = useMap();
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [activeStyle, setActiveStyle] = useState("default");

  // Get the actual Mapbox style URL based on selection and theme
  const getMapboxStyle = (styleId: string, currentTheme: "dark" | "light") => {
    if (styleId === "default") {
      return currentTheme === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11";
    }
    return `mapbox://styles/mapbox/${styleId}`;
  };

  const handleStyleChange = (value: string) => {
    if (!map) return;
    setActiveStyle(value);
    map.setStyle(getMapboxStyle(value, resolvedTheme));
  };

  // Update map when theme changes (only if using theme-aware style)
  useEffect(() => {
    if (!map || !THEME_AWARE_STYLES.includes(activeStyle)) return;
    map.setStyle(getMapboxStyle(activeStyle, resolvedTheme));
  }, [resolvedTheme, map, activeStyle]);

  const toggleTheme = () => {
    const newTheme =
      theme === "dark"
        ? "light"
        : theme === "light"
        ? "dark"
        : resolvedTheme === "dark"
        ? "light"
        : "dark";
    setTheme(newTheme);
  };

  return (
    <aside className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
      <Tabs value={activeStyle} onValueChange={handleStyleChange}>
        <TabsList className="bg-zinc-900/95 dark:bg-zinc-900/95 shadow-lg border border-zinc-800">
          {STYLE_OPTIONS.map((style) => (
            <TabsTrigger
              key={style.id}
              value={style.id}
              className="flex items-center px-3 py-1.5 data-[state=active]:bg-zinc-700"
            >
              {style.icon}
              <span className="hidden sm:inline">{style.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Theme toggle button */}
      <button
        onClick={toggleTheme}
        className="p-2.5 bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-all shadow-lg"
        aria-label={`Switch to ${
          resolvedTheme === "dark" ? "light" : "dark"
        } mode`}
      >
        {resolvedTheme === "dark" ? (
          <Sun className="w-4 h-4 text-amber-400" />
        ) : (
          <Moon className="w-4 h-4 text-blue-400" />
        )}
      </button>
    </aside>
  );
}
