import React, { useState } from "react";
import { MapIcon, SatelliteIcon, TreesIcon } from "lucide-react";
import { useMap } from "@/context/map-context";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type StyleOption = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

const STYLE_OPTIONS: StyleOption[] = [
  {
    id: "streets-v12",
    label: "Map",
    icon: <MapIcon className="w-4 h-4 mr-2" />,
  },
  {
    id: "satellite-streets-v12",
    label: "Satellite",
    icon: <SatelliteIcon className="w-4 h-4 mr-2" />,
  },
  {
    id: "outdoors-v12",
    label: "Terrain",
    icon: <TreesIcon className="w-4 h-4 mr-2" />,
  },
  // {
  //   id: "light-v11",
  //   label: "Light",
  //   icon: <SunIcon className="w-4 h-4 mr-2" />,
  // },
  // {
  //   id: "dark-v11",
  //   label: "Dark",
  //   icon: <MoonIcon className="w-4 h-4 mr-2" />,
  // },
];

export default function MapStyles() {
  const { map } = useMap();
  const [activeStyle, setActiveStyle] = useState("streets-v12");

  const handleChange = (value: string) => {
    if (!map) return;
    map.setStyle(`mapbox://styles/mapbox/${value}`);
    setActiveStyle(value);
  };

  // useEffect(() => {
  //   if (activeStyle === "dark-v11") {
  //     setTheme("dark");
  //   } else {
  //     setTheme("light");
  //   }
  // }, [activeStyle, setTheme]);

  return (
    <aside className="absolute bottom-4 left-4 z-10">
      <Tabs value={activeStyle} onValueChange={handleChange}>
        <TabsList className="dark:bg-slate-950 shadow-lg border">
          {STYLE_OPTIONS.map((style) => (
            <TabsTrigger
              key={style.id}
              value={style.id}
              className="flex items-center px-3 py-1.5"
            >
              {style.icon}
              <span className="hidden sm:inline">{style.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </aside>
  );
}
