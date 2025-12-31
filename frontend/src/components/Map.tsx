import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Station, RouteLine, CTrainPosition } from "@/types";
import { useTrainSimulation } from "@/hooks/useTrainSimulation";
import { useCTrainPositionsByLine, useBusStops } from "@/hooks/queries";
import TrainControls from "./TrainControls";
import {
  Zap,
  X,
  Navigation,
  Loader2,
  Radio,
  Wifi,
  WifiOff,
  Bus,
} from "lucide-react";
import { MapContext } from "@/context/map-context";
import MapSearch from "@/components/map/map-search";
import MapStyles from "@/components/map/map-styles";
import MapControls from "@/components/map/map-controls";
import Train3DLayer, {
  type TrainPositionData,
} from "@/components/map/train-3d-layer";
import { MAP_CONSTANTS } from "@/lib/mapbox/constants";
import { useTheme } from "@/stores/use-theme-store";

// Map themes to Mapbox styles
const MAPBOX_STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
} as const;

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
  const userLocationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const use3DTrains = true; // Enable 3D train models
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [followingTrain, setFollowingTrain] = useState<"Red" | "Blue" | null>(
    null
  );
  const [userLocation, setUserLocation] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Real-time train data toggle
  const [useRealTimeData, setUseRealTimeData] = useState(true);

  // Bus stops visibility toggle
  const [showBusStops, setShowBusStops] = useState(false);

  // Theme for map style
  const { resolvedTheme } = useTheme();

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  // Fetch bus stops (cached for 1 hour)
  const { data: busStops } = useBusStops({ enabled: showBusStops });

  // Fetch real-time C-Train positions (auto-refreshes every 10 seconds)
  const {
    data: realTimeTrains,
    isLoading: isLoadingTrains,
    isError: isTrainError,
    isFetching: isFetchingTrains,
  } = useCTrainPositionsByLine({
    refetchInterval: 10000, // Refresh every 10 seconds
    enabled: useRealTimeData && mapLoaded, // Only fetch when using real-time data and map is loaded
  });

  // Transform API data to the format expected by Train3DLayer
  const transformedRedTrains = useMemo((): TrainPositionData[] => {
    if (!realTimeTrains?.red) return [];
    return realTimeTrains.red
      .filter(
        (train: CTrainPosition) =>
          train.vehicle_id &&
          train.position &&
          typeof train.position.longitude === "number" &&
          typeof train.position.latitude === "number" &&
          !isNaN(train.position.longitude) &&
          !isNaN(train.position.latitude)
      )
      .map((train: CTrainPosition) => ({
        id: train.vehicle_id,
        lng: train.position.longitude,
        lat: train.position.latitude,
        bearing: train.position.bearing || 0,
        nearestStation: train.nearest_station,
        vehicleId: train.vehicle_id,
      }));
  }, [realTimeTrains?.red]);

  const transformedBlueTrains = useMemo((): TrainPositionData[] => {
    if (!realTimeTrains?.blue) return [];
    return realTimeTrains.blue
      .filter(
        (train: CTrainPosition) =>
          train.vehicle_id &&
          train.position &&
          typeof train.position.longitude === "number" &&
          typeof train.position.latitude === "number" &&
          !isNaN(train.position.longitude) &&
          !isNaN(train.position.latitude)
      )
      .map((train: CTrainPosition) => ({
        id: train.vehicle_id,
        lng: train.position.longitude,
        lat: train.position.latitude,
        bearing: train.position.bearing || 0,
        nearestStation: train.nearest_station,
        vehicleId: train.vehicle_id,
      }));
  }, [realTimeTrains?.blue]);

  // Check if real-time data is available
  const hasRealTimeData =
    transformedRedTrains.length > 0 || transformedBlueTrains.length > 0;

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
      style: MAPBOX_STYLES[resolvedTheme],
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
      setupMapLayers(map, routeLines, resolvedTheme);
    });

    // Re-add layers when style changes (e.g., from MapStyles component or theme change)
    map.on("style.load", () => {
      // Get the current theme from the store
      const currentTheme = useTheme.getState().resolvedTheme;
      setupMapLayers(map, routeLines, currentTheme);
    });

    return () => {
      map.remove();
      setMapInstance(null);
    };
  }, []);

  // Update map style when theme changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const currentStyle = mapRef.current.getStyle()?.sprite;
    const targetStyle = resolvedTheme === "dark" ? "dark-v11" : "light-v11";

    // Only change if the style is different (check if current style contains the target)
    if (currentStyle && !currentStyle.includes(targetStyle)) {
      mapRef.current.setStyle(MAPBOX_STYLES[resolvedTheme]);
    }
  }, [resolvedTheme, mapLoaded]);

  // 3D train models are now handled by Train3DLayer component
  // The trainPosition updates are passed to the component via props

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

  // Add/remove bus stops layer based on toggle
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // Remove existing bus stops layer and source if they exist
    if (map.getLayer("bus-stops-layer")) {
      map.removeLayer("bus-stops-layer");
    }
    if (map.getLayer("bus-stops-cluster-count")) {
      map.removeLayer("bus-stops-cluster-count");
    }
    if (map.getLayer("bus-stops-clusters")) {
      map.removeLayer("bus-stops-clusters");
    }
    if (map.getSource("bus-stops")) {
      map.removeSource("bus-stops");
    }

    // If bus stops are disabled or no data, don't add anything
    if (!showBusStops || !busStops || busStops.length === 0) return;

    // Create GeoJSON from bus stops
    const geojsonData: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: busStops.map((stop) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: stop.coords,
        },
        properties: {
          id: stop.id,
          name: stop.name,
          code: stop.code,
        },
      })),
    };

    // Add source with clustering enabled
    map.addSource("bus-stops", {
      type: "geojson",
      data: geojsonData,
      cluster: true,
      clusterMaxZoom: 14, // Max zoom to cluster points
      clusterRadius: 50, // Radius of each cluster
    });

    // Add cluster circles layer
    map.addLayer({
      id: "bus-stops-clusters",
      type: "circle",
      source: "bus-stops",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#51bbd6", // Blue for small clusters
          100,
          "#f1f075", // Yellow for medium clusters
          750,
          "#f28cb1", // Pink for large clusters
        ],
        "circle-radius": ["step", ["get", "point_count"], 20, 100, 30, 750, 40],
        "circle-opacity": 0.8,
      },
    });

    // Add cluster count labels
    map.addLayer({
      id: "bus-stops-cluster-count",
      type: "symbol",
      source: "bus-stops",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 12,
      },
      paint: {
        "text-color": "#000",
      },
    });

    // Add individual bus stop markers (unclustered points)
    map.addLayer({
      id: "bus-stops-layer",
      type: "circle",
      source: "bus-stops",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#22c55e", // Green color for bus stops
        "circle-radius": 5,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#16a34a",
        "circle-opacity": 0.9,
      },
      minzoom: 13, // Only show individual stops at zoom 13+
    });

    // Add popup on click for individual stops
    map.on("click", "bus-stops-layer", (e) => {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0];
      const coordinates = (
        feature.geometry as GeoJSON.Point
      ).coordinates.slice() as [number, number];
      const name = feature.properties?.name || "Bus Stop";
      const code = feature.properties?.code || "";

      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(
          `
          <div style="padding: 8px; font-family: system-ui;">
            <strong style="font-size: 14px;">${name}</strong>
            ${
              code
                ? `<p style="margin: 4px 0 0; font-size: 12px; color: #666;">Stop #${code}</p>`
                : ""
            }
          </div>
        `
        )
        .addTo(map);
    });

    // Change cursor on hover
    map.on("mouseenter", "bus-stops-layer", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "bus-stops-layer", () => {
      map.getCanvas().style.cursor = "";
    });

    // Zoom to cluster on click
    map.on("click", "bus-stops-clusters", (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["bus-stops-clusters"],
      });
      if (!features.length) return;
      const clusterId = features[0].properties?.cluster_id as
        | number
        | undefined;
      if (clusterId === undefined) return;
      const source = map.getSource("bus-stops") as mapboxgl.GeoJSONSource;
      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom === undefined || zoom === null) return;
        map.easeTo({
          center: (features[0].geometry as GeoJSON.Point).coordinates as [
            number,
            number
          ],
          zoom,
        });
      });
    });

    map.on("mouseenter", "bus-stops-clusters", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "bus-stops-clusters", () => {
      map.getCanvas().style.cursor = "";
    });
  }, [mapLoaded, showBusStops, busStops]);

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

  // Create user location marker element
  const createUserLocationEl = useCallback(() => {
    const el = document.createElement("div");
    el.className = "user-location-marker";
    el.innerHTML = `
      <div class="relative flex items-center justify-center">
        <div class="absolute size-10 rounded-full bg-blue-500/20 animate-ping"></div>
        <div class="absolute size-6 rounded-full bg-blue-500/30"></div>
        <div class="relative size-4 rounded-full bg-blue-500 border-2 border-white shadow-lg"></div>
      </div>
    `;
    return el;
  }, []);

  // Update user location marker when location changes
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !userLocation) return;

    // Remove existing marker
    if (userLocationMarkerRef.current) {
      userLocationMarkerRef.current.remove();
    }

    // Create new marker
    const marker = new mapboxgl.Marker({
      element: createUserLocationEl(),
      anchor: "center",
    })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(mapRef.current);

    userLocationMarkerRef.current = marker;

    return () => {
      marker.remove();
    };
  }, [mapLoaded, userLocation, createUserLocationEl]);

  // Get user location
  const getUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude, latitude } = position.coords;
        setUserLocation({ lng: longitude, lat: latitude });
        setIsLocating(false);

        // Fly to user location
        mapRef.current?.flyTo({
          center: [longitude, latitude],
          zoom: 15,
          pitch: 60,
          duration: 2000,
        });
      },
      (error) => {
        setIsLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError("Location permission denied");
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError("Location unavailable");
            break;
          case error.TIMEOUT:
            setLocationError("Location request timed out");
            break;
          default:
            setLocationError("Failed to get location");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, []);

  // Fly to user location (if already obtained)
  const flyToUserLocation = useCallback(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 15,
        pitch: 60,
        duration: 1500,
      });
    } else {
      getUserLocation();
    }
  }, [userLocation, getUserLocation]);

  return (
    <MapContext.Provider value={{ map: mapInstance }}>
      <div className="flex-1 h-full relative bg-black overflow-hidden">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* 3D Train Models */}
        {mapLoaded && use3DTrains && (
          <Train3DLayer
            map={mapInstance}
            // Pass real-time data if available and enabled, otherwise use simulation
            redTrains={
              useRealTimeData && hasRealTimeData
                ? transformedRedTrains
                : undefined
            }
            blueTrains={
              useRealTimeData && hasRealTimeData
                ? transformedBlueTrains
                : undefined
            }
            // Fallback to simulation when real data is not available
            redTrainPosition={
              !useRealTimeData || !hasRealTimeData
                ? redTrain.trainPosition
                : null
            }
            blueTrainPosition={
              !useRealTimeData || !hasRealTimeData
                ? blueTrain.trainPosition
                : null
            }
          />
        )}

        {/* Map Search - top center */}
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

        {/* Map Action Buttons */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
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
            className="p-3 bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-2xl hover:bg-zinc-800 transition-all"
            aria-label="Reset map view"
          >
            <Zap className="w-5 h-5 text-zinc-300" />
          </button>

          {/* My Location Button */}
          <button
            onClick={flyToUserLocation}
            disabled={isLocating}
            className={`p-3 backdrop-blur-sm border rounded-2xl transition-all ${
              userLocation
                ? "bg-blue-600/90 border-blue-500 hover:bg-blue-500"
                : "bg-zinc-900/95 border-zinc-800 hover:bg-zinc-800"
            } ${isLocating ? "cursor-wait" : ""}`}
            aria-label="My location"
          >
            {isLocating ? (
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            ) : (
              <Navigation
                className={`w-5 h-5 ${
                  userLocation ? "text-white" : "text-zinc-300"
                }`}
              />
            )}
          </button>

          {/* Real-time Data Toggle */}
          <button
            onClick={() => setUseRealTimeData(!useRealTimeData)}
            className={`p-3 backdrop-blur-sm border rounded-2xl transition-all ${
              useRealTimeData && hasRealTimeData
                ? "bg-green-600/90 border-green-500 hover:bg-green-500"
                : useRealTimeData && !hasRealTimeData
                ? "bg-amber-600/90 border-amber-500 hover:bg-amber-500"
                : "bg-zinc-900/95 border-zinc-800 hover:bg-zinc-800"
            }`}
            aria-label={
              useRealTimeData
                ? "Switch to simulation"
                : "Switch to real-time data"
            }
          >
            {isFetchingTrains ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : useRealTimeData && hasRealTimeData ? (
              <Wifi className="w-5 h-5 text-white" />
            ) : useRealTimeData && !hasRealTimeData ? (
              <WifiOff className="w-5 h-5 text-white" />
            ) : (
              <Radio className="w-5 h-5 text-zinc-300" />
            )}
          </button>

          {/* Bus Stops Toggle */}
          <button
            onClick={() => setShowBusStops(!showBusStops)}
            className={`p-3 backdrop-blur-sm border rounded-2xl transition-all ${
              showBusStops
                ? "bg-green-600/90 border-green-500 hover:bg-green-500"
                : "bg-zinc-900/95 border-zinc-800 hover:bg-zinc-800"
            }`}
            aria-label={showBusStops ? "Hide bus stops" : "Show bus stops"}
            title={showBusStops ? "Hide bus stops" : "Show bus stops"}
          >
            <Bus
              className={`w-5 h-5 ${
                showBusStops ? "text-white" : "text-zinc-300"
              }`}
            />
          </button>
        </div>

        {/* Real-time Data Status Indicator */}
        {mapLoaded && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl backdrop-blur-sm border text-xs font-medium transition-all ${
                useRealTimeData && hasRealTimeData
                  ? "bg-green-900/80 border-green-700 text-green-200"
                  : useRealTimeData && isLoadingTrains
                  ? "bg-amber-900/80 border-amber-700 text-amber-200"
                  : useRealTimeData && isTrainError
                  ? "bg-red-900/80 border-red-700 text-red-200"
                  : "bg-zinc-900/80 border-zinc-700 text-zinc-300"
              }`}
            >
              {useRealTimeData && hasRealTimeData ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span>
                    LIVE • {transformedRedTrains.length} Red,{" "}
                    {transformedBlueTrains.length} Blue
                  </span>
                </>
              ) : useRealTimeData && isLoadingTrains ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Connecting to live data...</span>
                </>
              ) : useRealTimeData && isTrainError ? (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>Live data unavailable • Using simulation</span>
                </>
              ) : (
                <>
                  <Radio className="w-3 h-3" />
                  <span>SIMULATION MODE</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Location Error Toast */}
        {locationError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-red-500/90 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-2">
            {locationError}
            <button
              onClick={() => setLocationError(null)}
              className="ml-3 hover:text-red-200"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4 inline" />
            </button>
          </div>
        )}

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

function setupMapLayers(
  map: mapboxgl.Map,
  routeLines: RouteLine[],
  theme: "dark" | "light" = "dark"
) {
  const layers = map.getStyle().layers;
  const labelLayerId = layers?.find(
    (layer) =>
      layer.type === "symbol" && layer.layout && layer.layout["text-field"]
  )?.id;

  // Theme-aware building colors
  const buildingColor = theme === "dark" ? "#444" : "#d1d5db";
  const buildingOpacity = theme === "dark" ? 0.6 : 0.7;

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
          "fill-extrusion-color": buildingColor,
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "min_height"],
          "fill-extrusion-opacity": buildingOpacity,
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
