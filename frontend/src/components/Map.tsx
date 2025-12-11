import { useRef, useEffect } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { stationsData, type Station } from "@/data/StationObject";

interface MapComponentProps {
  stations: Station[];
  selectedStation: Station | null;
  onStationSelect: (station: Station) => void;
  onCloseStationInfo: () => void;
}

const Map = ({
  stations,
  selectedStation,
  onStationSelect,
  onCloseStationInfo,
}: MapComponentProps) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  const getMarkerColor = (station: Station) => {
    if (station.shared) {
      return "h-2.5 w-2.5 rounded-full bg-orange-400 shadow-[0px_0px_4px_2px_rgba(245,158,11,0.9)] cursor-pointer";
    }
    if (station.line === "Red") {
      return "h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0px_0px_4px_2px_rgba(239,68,68,0.9)] cursor-pointer";
    }
    return "h-2.5 w-2.5 rounded-full bg-blue-400 shadow-[0px_0px_4px_2px_rgba(59,130,246,0.9)] cursor-pointer";
  };

  useEffect(() => {
    if (!mapboxToken || !mapContainerRef.current) {
      console.error("Mapbox token or container not available");
      return;
    }

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      style: "mapbox://styles/mapbox/dark-v11",
      container: mapContainerRef.current,
      center: [-114.0708, 51.0447],
      zoom: 11,
      pitch: 52,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      const layers = map.getStyle().layers;
      const labelLayerId = layers?.find(
        (layer) =>
          layer.type === "symbol" && layer.layout && layer.layout["text-field"]
      )?.id;

      if (labelLayerId) {
        map.addLayer(
          {
            id: "3d-buildings",
            source: "composite",
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 15,
            paint: {
              "fill-extrusion-color": "#444",
              "fill-extrusion-height": ["get", "height"],
              "fill-extrusion-base": ["get", "min_height"],
              "fill-extrusion-opacity": 0.6,
            },
          },
          labelLayerId
        );
      }

      // Add Red Line
      const redStations = stationsData.red;
      map.addSource("red-line", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: redStations.map((s) => s.coords),
          },
        },
      });

      map.addLayer({
        id: "red-line",
        type: "line",
        source: "red-line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#DC143C",
          "line-width": 4,
          "line-opacity": 0.8,
        },
      });

      // Add Blue Line
      const blueStations = stationsData.blue;
      map.addSource("blue-line", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: blueStations.map((s) => s.coords),
          },
        },
      });

      map.addLayer({
        id: "blue-line",
        type: "line",
        source: "blue-line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#0088FF",
          "line-width": 4,
          "line-opacity": 0.8,
        },
      });

      // Add station markers
      stations.forEach((station) => {
        const el = document.createElement("div");
        el.className = getMarkerColor(station);

        el.addEventListener("click", () => {
          onStationSelect(station);
          map.flyTo({
            center: station.coords,
            zoom: 15,
            pitch: 60,
            duration: 1500,
          });

          const stationElement = document.getElementById(
            `station-${station.name}`
          );
          setTimeout(() => {
            if (stationElement) {
              stationElement.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }
          }, 300);
        });

        const marker = new mapboxgl.Marker(el)
          .setLngLat(station.coords)
          .addTo(map);

        markersRef.current.push(marker);
      });
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, []);

  // Handle external station selection (from sidebar)
  useEffect(() => {
    if (selectedStation && mapRef.current) {
      mapRef.current.flyTo({
        center: selectedStation.coords,
        zoom: 15,
        pitch: 60,
        duration: 1500,
      });
    }
  }, [selectedStation]);

  return (
    <div className="flex-1 h-full relative bg-black">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute bottom-10 left-8 bg-[#18181b]/90 rounded-2xl flex flex-col gap-2 py-2.5 px-2">
        <div className="flex items-center gap-0">
          <div className="h-2 w-2 rounded-full bg-red-400 flex-none"></div>
          <div className="ml-2 rounded-lg px-2 py-1 text-sm w-full bg-red-700/30 text-red-300/90">
            Red Line
          </div>
        </div>
        <div className="flex items-center gap-0">
          <div className="h-2 w-2 rounded-full bg-blue-400 flex-none"></div>
          <div className="ml-2 rounded-lg px-2 py-1 text-sm w-full bg-blue-700/30 text-blue-300/90">
            Blue Line
          </div>
        </div>
        <div className="flex items-center gap-0">
          <div className="h-2 w-2 rounded-full bg-amber-400 flex-none"></div>
          <div className="ml-2 rounded-lg px-2 py-1 text-sm w-full bg-amber-800/30 text-amber-300/90">
            Transit Mall
          </div>
        </div>
      </div>

      {/* Selected Station Panel */}
      {selectedStation && (
        <div className="absolute top-8 right-8 bg-[#18181b]/95 backdrop-blur-sm border border-zinc-800/50 rounded-2xl p-5 min-w-[280px] shadow-2xl">
          <button
            onClick={onCloseStationInfo}
            className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ✕
          </button>

          <h3 className="text-lg font-semibold text-white mb-3 pr-6">
            {selectedStation.name}
          </h3>

          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">Line:</span>
              <span
                className={`font-semibold ${
                  selectedStation.line === "Red"
                    ? "text-red-400"
                    : "text-blue-400"
                }`}
              >
                {selectedStation.line} Line
              </span>
              <span className="text-zinc-500">• {selectedStation.route}</span>
            </div>

            {selectedStation.shared && (
              <div className="bg-amber-500/15 border border-amber-500/25 rounded-lg px-3 py-2 mt-3">
                <p className="text-amber-400 font-medium text-xs">
                  ⭐ Downtown Transit Mall
                </p>
                <p className="text-amber-400/60 text-xs mt-0.5">
                  Free Fare Zone
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Map;
