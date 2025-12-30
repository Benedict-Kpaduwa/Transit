import { useRef, useEffect, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Station, RouteLine } from "@/types";
import { useTrainSimulation } from "@/hooks/useTrainSimulation";
import TrainControls from "./TrainControls";
import { Zap, X } from "lucide-react";
import { MapContext } from "@/context/map-context";
import MapSearch from "@/components/map/map-search";
import MapStyles from "@/components/map/map-styles";
import MapControls from "@/components/map/map-controls";
import { MAP_CONSTANTS } from "@/lib/mapbox/constants";

interface MapComponentProps {
  stations: Station[];
  routeLines: RouteLine[];
  selectedStation: Station | null;
  onStationSelect: (station: Station) => void;
  onCloseStationInfo: () => void;
}

const Map = ({
  stations,
  routeLines,
  selectedStation,
  onStationSelect,
  onCloseStationInfo,
}: MapComponentProps) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const trainMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [followingTrain, setFollowingTrain] = useState<"Red" | "Blue" | null>(
    null
  );

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  const redStations = useMemo(
    () => stations.filter((s) => s.line === "Red"),
    [stations]
  );

  const blueStations = useMemo(
    () => stations.filter((s) => s.line === "Blue"),
    [stations]
  );

  const redTrain = useTrainSimulation({
    routeLines,
    stations: redStations,
    lineColor: "Red",
    speed: 0.0008,
  });

  const blueTrain = useTrainSimulation({
    routeLines,
    stations: blueStations,
    lineColor: "Blue",
    speed: 0.0006,
  });

  useEffect(() => {
    if (!mapboxToken || !mapContainerRef.current) return;

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      style: "mapbox://styles/mapbox/dark-v11",
      container: mapContainerRef.current,
      center: MAP_CONSTANTS.CENTER,
      antialias: true,
      zoom: MAP_CONSTANTS.DEFAULT_ZOOM,
      pitch: MAP_CONSTANTS.DEFAULT_PITCH,
    });

    mapRef.current = map;
    setMapInstance(map);

    map.on("load", () => {
      setMapLoaded(true);
      setupMapLayers(map, routeLines);
    });

    // Re-add layers when style changes (e.g., from MapStyles component)
    map.on("style.load", () => {
      setupMapLayers(map, routeLines);
    });

    return () => {
      map.remove();
      setMapInstance(null);
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    const createTrainEl = (color: string) => {
      const el = document.createElement("div");
      el.className = `relative w-5 h-5 rounded-full bg-gradient-to-r ${color} shadow-lg animate-pulse cursor-pointer`;
      el.innerHTML = `<div class="absolute inset-0 rounded-full border-2 border-white/30 animate-ping"></div>`;
      return el;
    };

    const redMarker = new mapboxgl.Marker({
      element: createTrainEl("from-red-500 to-red-600"),
      rotationAlignment: "map",
    })
      .setLngLat([0, 0])
      .addTo(mapRef.current);

    const blueMarker = new mapboxgl.Marker({
      element: createTrainEl("from-blue-500 to-blue-600"),
      rotationAlignment: "map",
    })
      .setLngLat([0, 0])
      .addTo(mapRef.current);

    trainMarkersRef.current = [redMarker, blueMarker];
  }, [mapLoaded]);

  useEffect(() => {
    const [redMarker, blueMarker] = trainMarkersRef.current;
    if (redMarker && redTrain.trainPosition) {
      redMarker.setLngLat([
        redTrain.trainPosition.lng,
        redTrain.trainPosition.lat,
      ]);
      redMarker.setRotation(redTrain.trainPosition.bearing);
    }
    if (blueMarker && blueTrain.trainPosition) {
      blueMarker.setLngLat([
        blueTrain.trainPosition.lng,
        blueTrain.trainPosition.lat,
      ]);
      blueMarker.setRotation(blueTrain.trainPosition.bearing);
    }
  }, [redTrain.trainPosition, blueTrain.trainPosition]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    markersRef.current.forEach((m) => m.remove());

    stations.forEach((station) => {
      const el = document.createElement("div");
      el.className = `h-2.5 w-2.5 rounded-full cursor-pointer transition-all duration-300 ${
        station.shared
          ? "bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.8)]"
          : station.line === "Red"
          ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]"
          : "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"
      }`;

      el.onclick = () => onStationSelect(station);

      const marker = new mapboxgl.Marker(el)
        .setLngLat(station.coords)
        .addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [mapLoaded, stations]);

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

  useEffect(() => {
    if (!followingTrain || !mapRef.current) return;

    const target =
      followingTrain === "Red"
        ? redTrain.trainPosition
        : blueTrain.trainPosition;

    if (target) {
      // mapRef.current.easeTo({
      //   center: [target.lng, target.lat],
      //   duration: 100,
      //   easing: (t) => t,
      //   pitch: 60,
      //   zoom: 15.5,
      // });

      mapRef.current.jumpTo({
        center: [target.lng, target.lat],
        bearing: target.bearing,
        pitch: 60,
        zoom: 15.5,
      });
    }
  }, [redTrain.trainPosition, blueTrain.trainPosition, followingTrain]);

  return (
    <MapContext.Provider value={{ map: mapInstance }}>
      <div className="flex-1 h-full relative bg-black overflow-hidden">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Map Search - top left */}
        {mapLoaded && <MapSearch />}

        {/* Map Style Switcher - bottom left */}
        {mapLoaded && <MapStyles />}

        {/* Zoom Controls - bottom right */}
        {mapLoaded && <MapControls />}

        {/* Train Following Controls */}
        <div className="absolute bottom-32 left-8 flex flex-col gap-2 rounded-2xl z-10">
          <button
            onClick={() =>
              setFollowingTrain(followingTrain === "Red" ? null : "Red")
            }
            className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${
              followingTrain === "Red"
                ? "bg-red-500 border-white text-white"
                : "bg-black/80 border-red-500 text-red-500"
            }`}
          >
            {followingTrain === "Red" ? "STOP FOLLOWING" : "FOLLOW RED TRAIN"}
          </button>
          <button
            onClick={() =>
              setFollowingTrain(followingTrain === "Blue" ? null : "Blue")
            }
            className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${
              followingTrain === "Blue"
                ? "bg-blue-500 border-white text-white"
                : "bg-black/80 border-blue-500 text-blue-500"
            }`}
          >
            {followingTrain === "Blue" ? "STOP FOLLOWING" : "FOLLOW BLUE TRAIN"}
          </button>
        </div>

        {/* Train Speed Controls */}
        <TrainControls redTrain={redTrain} blueTrain={blueTrain} />

        {/* Reset View Button */}
        <button
          onClick={() =>
            mapRef.current?.flyTo({
              center: MAP_CONSTANTS.CENTER,
              zoom: MAP_CONSTANTS.DEFAULT_ZOOM,
              pitch: MAP_CONSTANTS.DEFAULT_PITCH,
              bearing: 0,
            })
          }
          className="absolute top-4 right-4 z-10 p-3 bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-2xl hover:bg-zinc-800 transition-all"
          aria-label="Reset map view"
        >
          <Zap className="w-5 h-5 text-zinc-300" />
        </button>

        {/* Selected Station Info Panel */}
        {selectedStation && (
          <div className="absolute top-20 right-4 bg-[#18181b]/95 backdrop-blur-sm border border-zinc-800/50 rounded-2xl p-5 min-w-[280px] shadow-2xl z-20">
            <button
              onClick={onCloseStationInfo}
              className="absolute top-4 right-3 text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Close station info"
            >
              <X className="w-4 h-4" />
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
              </div>
              {selectedStation.shared && (
                <div className="bg-amber-500/15 border border-amber-500/25 rounded-lg px-3 py-2 mt-3">
                  <p className="text-amber-400 font-medium text-xs">
                    ⭐ Downtown Transit Mall
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </MapContext.Provider>
  );
};

function setupMapLayers(map: mapboxgl.Map, routeLines: RouteLine[]) {
  const layers = map.getStyle().layers;
  const labelLayerId = layers?.find(
    (layer) =>
      layer.type === "symbol" && layer.layout && layer.layout["text-field"]
  )?.id;

  if (!map.getLayer("3d-buildings")) {
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

  routeLines.forEach((route, index) => {
    const id = `route-${index}`;
    if (!map.getSource(id)) {
      map.addSource(id, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: route.coordinates },
          properties: {},
        },
      });

      map.addLayer(
        {
          id,
          type: "line",
          source: id,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color":
              route.properties.line === "RED" ? "#DC143C" : "#0088FF",
            "line-width": 4,
            "line-opacity": 0.8,
          },
        },
        labelLayerId
      ); // Also insert routes below labels
    }
  });
}

export default Map;
