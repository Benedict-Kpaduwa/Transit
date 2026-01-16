import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Station, RouteLine, CTrainPosition } from "@/types";
import { useCTrainPositionsByLine, useBusStops, useBusPositions } from "@/hooks/queries";
import TripPlanner from "./TripPlanner";
import { type TripPlan } from "@/services/api";
import {
  Zap,
  X,
  Navigation,
  Loader2,
  Radio,
  Wifi,
  WifiOff,
  Bus,
  Train,
} from "lucide-react";
import { MapContext } from "@/context/map-context";
import MapSearch from "@/components/map/map-search";
import MapStyles from "@/components/map/map-styles";
import MapControls from "@/components/map/map-controls";
import VehicleLayer, {
  type VehiclePositionData,
} from "@/components/map/vehicle-layer";
import Vehicle3DLayer from "@/components/map/Vehicle3DLayer";
import { MAP_CONSTANTS } from "@/lib/mapbox/constants";
import { useTheme } from "@/stores/use-theme-store";
import { useMapStore } from "@/stores/useMapStore";
import { useSidebar } from "@/components/ui/sidebar";
import { useStationArrivals, formatArrivalTime, getArrivalUrgencyColor } from "@/hooks/useArrivals";

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
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [userLocation, setUserLocationLocal] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Get store values
  const { setUserLocation: setUserLocationStore, trackedVehicle, setTrackedVehicle } = useMapStore();

  // Sync local user location to store
  const setUserLocation = useCallback(
    (location: { lng: number; lat: number } | null) => {
      setUserLocationLocal(location);
      setUserLocationStore(location);
    },
    [setUserLocationStore]
  );


  // Live trains visibility toggle - from store so sidebar can control it
  const { showLiveTrains, setShowLiveTrains, showLiveBuses, setShowLiveBuses } = useMapStore();

  // Bus stops visibility toggle
  const [showBusStops, setShowBusStops] = useState(false);

  // Train lines visibility toggle (hidden by default, shown when directions active)
  const [showTrainLines, setShowTrainLines] = useState(false);
  // Ref to track showTrainLines for style.load event
  const showTrainLinesRef = useRef(showTrainLines);

  // Trip planning state
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const tripMarkersRef = useRef<mapboxgl.Marker[]>([]);
  // Counter to trigger trip route redraw after style changes
  const [styleChangeCounter, setStyleChangeCounter] = useState(0);

  // External destination for "Get Directions" from search results
  const [externalDestination, setExternalDestination] = useState<{
    name: string;
    address: string;
    coordinates: [number, number];
  } | null>(null);

  // Viewed route shape (when clicking "View Route" on a bus)
  const [viewedRouteShape, setViewedRouteShape] = useState<{
    routeId: string;
    coordinates: [number, number][];
    color: string;
  } | null>(null);

  // Theme for map style
  const { resolvedTheme } = useTheme();

  // Get sidebar state for triggering map resize
  const { state: sidebarState } = useSidebar();

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  // Fetch bus stops (cached for 1 hour)
  const { data: busStops } = useBusStops({ enabled: showBusStops });

  // Fetch arrivals for selected station
  const { data: stationArrivals, isLoading: isLoadingArrivals } = useStationArrivals(
    selectedStation?.name ?? null,
    {
      enabled: !!selectedStation,
      refetchInterval: 30000,
    }
  );

  // Check if tracking a train
  const isTrackingTrain = trackedVehicle?.vehicleType === "CTrain";
  
  // Fetch real-time C-Train positions (auto-refreshes every 10 seconds)
  // Also fetch when tracking a specific train
  const {
    data: realTimeTrains,
    isLoading: isLoadingTrains,
    isError: isTrainError,
    isFetching: isFetchingTrains,
  } = useCTrainPositionsByLine({
    refetchInterval: 10000, // Refresh every 10 seconds
    enabled: (showLiveTrains || isTrackingTrain) && mapLoaded, // Fetch when toggle is on OR when tracking a train
  });

  // Transform API data to the format expected by VehicleLayer
  const transformedRedTrains = useMemo((): VehiclePositionData[] => {
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
        vehicleType: "CTrain" as const,
        routeShortName: train.route_short_name || "201",
        headsign: train.headsign,
        color: "#DC2626", // Red line color
        vehicleId: train.vehicle_id,
        tripId: train.trip_id,
      }));
  }, [realTimeTrains?.red]);

  const transformedBlueTrains = useMemo((): VehiclePositionData[] => {
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
        vehicleType: "CTrain" as const,
        routeShortName: train.route_short_name || "202",
        headsign: train.headsign,
        color: "#2563EB", // Blue line color
        vehicleId: train.vehicle_id,
        tripId: train.trip_id,
      }));
  }, [realTimeTrains?.blue]);

  // Fetch bus positions when tracking a bus
  const isTrackingBus = trackedVehicle?.vehicleType === "Bus";
  
  // Fetch ALL buses when showLiveBuses is enabled OR when tracking a specific bus
  // This ensures we always have the tracked bus data available
  const { data: allBusPositionsData, isFetching: isFetchingBuses } = useBusPositions(undefined, {
    refetchInterval: 10000,
    enabled: (showLiveBuses || isTrackingBus) && mapLoaded,
  });

  // Transform ALL bus positions for the map
  const transformedBuses = useMemo((): VehiclePositionData[] => {
    if (!allBusPositionsData?.vehicles) return [];
    
    return allBusPositionsData.vehicles
      .filter(bus => 
        bus.position &&
        typeof bus.position.longitude === "number" &&
        typeof bus.position.latitude === "number" &&
        !isNaN(bus.position.longitude) &&
        !isNaN(bus.position.latitude)
      )
      .map(bus => ({
        id: bus.vehicle_id || bus.trip_id,
        lng: bus.position.longitude,
        lat: bus.position.latitude,
        bearing: bus.position.bearing || 0,
        vehicleType: "Bus" as const,
        routeShortName: bus.route_short_name,
        headsign: bus.headsign,
        color: "#22c55e", // Default green for buses
        vehicleId: bus.vehicle_id,
        tripId: bus.trip_id,
        timestamp: bus.timestamp,
      }));
  }, [allBusPositionsData]);

  // Get tracked bus position from all buses
  const trackedBusPosition = useMemo((): VehiclePositionData | null => {
    if (!isTrackingBus || !trackedVehicle) return null;
    
    // Find the specific bus we're tracking from all buses
    const bus = transformedBuses.find(v => v.tripId === trackedVehicle.tripId)
      || transformedBuses.find(v => v.vehicleId === trackedVehicle.vehicleId);
    
    if (bus) {
      return { ...bus, color: trackedVehicle.color || bus.color };
    }
    
    return null;
  }, [isTrackingBus, transformedBuses, trackedVehicle]);

  // Get tracked train position from all trains
  const trackedTrainPosition = useMemo((): VehiclePositionData | null => {
    if (!isTrackingTrain || !trackedVehicle) return null;
    
    // Combine all trains to search through
    const allTrains = [...transformedRedTrains, ...transformedBlueTrains];
    
    // Find the specific train we're tracking
    const train = allTrains.find(v => v.tripId === trackedVehicle.tripId)
      || allTrains.find(v => v.vehicleId === trackedVehicle.vehicleId);
    
    if (train) {
      return { ...train, color: trackedVehicle.color || train.color };
    }
    
    return null;
  }, [isTrackingTrain, transformedRedTrains, transformedBlueTrains, trackedVehicle]);

  // Combine all vehicles for VehicleLayer (CTrains + Buses)
  const allVehicles = useMemo((): VehiclePositionData[] => {
    const vehicles: VehiclePositionData[] = [];
    
    // If tracking a specific train, ONLY show that train - ignore showLiveTrains toggle
    if (isTrackingTrain && trackedTrainPosition) {
      vehicles.push(trackedTrainPosition);
    } else if (showLiveTrains && !isTrackingBus) {
      // Only show all trains if NOT tracking a specific vehicle
      vehicles.push(...transformedRedTrains, ...transformedBlueTrains);
    }
    
    // If tracking a specific bus, ONLY show that bus - ignore showLiveBuses toggle
    if (isTrackingBus && trackedBusPosition) {
      vehicles.push(trackedBusPosition);
    } else if (showLiveBuses && !isTrackingTrain) {
      // Only show all buses if NOT tracking a specific vehicle
      vehicles.push(...transformedBuses);
    }
    
    return vehicles;
  }, [transformedRedTrains, transformedBlueTrains, transformedBuses, trackedBusPosition, trackedTrainPosition, showLiveTrains, showLiveBuses, isTrackingBus, isTrackingTrain]);

  // Check if real-time data is available
  const hasRealTimeData =
    transformedRedTrains.length > 0 || transformedBlueTrains.length > 0 || transformedBuses.length > 0 || !!trackedBusPosition || !!trackedTrainPosition;

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
      // Initial setup - train lines hidden by default
      setupMapLayers(map, routeLines, resolvedTheme, false);
    });

    // Re-add layers when style changes (e.g., from MapStyles component or theme change)
    map.on("style.load", () => {
      // Get the current theme from the store
      const currentTheme = useTheme.getState().resolvedTheme;
      // Preserve current showTrainLines state on style changes using ref
      setupMapLayers(map, routeLines, currentTheme, showTrainLinesRef.current);
      // Trigger trip route redraw after style is fully loaded (with small delay to ensure readiness)
      setTimeout(() => setStyleChangeCounter((c) => c + 1), 100);
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

  // Resize map when sidebar collapses/expands to prevent dark space
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Wait for sidebar transition to complete (300ms is the sidebar transition duration)
    const timeoutId = setTimeout(() => {
      mapRef.current?.resize();
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [sidebarState, mapLoaded]);

  // Sync showTrainLines ref for style.load event
  useEffect(() => {
    showTrainLinesRef.current = showTrainLines;
  }, [showTrainLines]);

  // Update train lines visibility when toggle changes
  // Note: Trip directions use their own transit route layer, not these full lines
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    // Only show full train lines when manually toggled
    // Trip directions draw their own specific segment via trip-transit-route layer
    const shouldShowLines = showTrainLines;

    routeLines.forEach((route, index) => {
      const layerId = `route-${index}`;

      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          shouldShowLines ? "visible" : "none"
        );
      } else if (shouldShowLines) {
        // Layer doesn't exist, need to create it
        const layers = map.getStyle().layers;
        const labelLayerId = layers?.find(
          (layer) =>
            layer.type === "symbol" &&
            layer.layout &&
            layer.layout["text-field"]
        )?.id;

        if (!map.getSource(layerId)) {
          map.addSource(layerId, {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: { type: "LineString", coordinates: route.coordinates },
              properties: {},
            },
          });
        }

        map.addLayer(
          {
            id: layerId,
            type: "line",
            source: layerId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color":
                route.properties.line === "RED" ? "#DC143C" : "#0088FF",
              "line-width": 4,
              "line-opacity": 0.8,
            },
          },
          labelLayerId
        );
      }
    });
  }, [showTrainLines, mapLoaded, routeLines]);

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
          routes: JSON.stringify(stop.routes || []),
          routeNames: JSON.stringify(stop.routeNames || []),
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
      const stopId = feature.properties?.id || "";

      // Parse routes and route names from JSON strings
      let routes: string[] = [];
      let routeNames: string[] = [];
      try {
        routes = JSON.parse(feature.properties?.routes || "[]");
        routeNames = JSON.parse(feature.properties?.routeNames || "[]");
      } catch {
        routes = [];
        routeNames = [];
      }

      // Generate unique route colors based on route number
      const getRouteColor = (route: string) => {
        // BRT/MAX routes
        if (route === "301") return "#f97316"; // MAX Orange
        if (route === "302") return "#a855f7"; // MAX Purple
        if (route === "303") return "#eab308"; // MAX Yellow
        if (route === "305") return "#14b8a6"; // MAX Teal
        if (route === "306") return "#3b82f6"; // MAX Blue
        if (route === "307") return "#22c55e"; // MAX Green
        // Express routes (400s)
        const num = parseInt(route);
        if (num >= 400 && num < 500) return "#ef4444"; // Red for express
        // Regular routes - green
        return "#22c55e";
      };

      // Create routes display HTML - modern design
      const routesHtml =
        routes.length > 0
          ? `
            <div style="margin-top: 12px;">
              <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a; font-weight: 600; margin-bottom: 8px;">
                Routes at this stop
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${routes
                  .slice(0, 10)
                  .map((r, idx) => {
                    const color = getRouteColor(r);
                    const routeName = routeNames[idx] || "";
                    const isMAX = r.startsWith("30") && r.length === 3;
                    const displayName = isMAX
                      ? routeName.replace("MAX ", "")
                      : r;
                    return `<div style="display: flex; align-items: center; gap: 4px; background: ${color}15; border: 1px solid ${color}40; padding: 4px 8px; border-radius: 8px; cursor: default;" title="${
                      routeName || `Route ${r}`
                    }"><span style="background: ${color}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; min-width: 20px; text-align: center;">${r}</span>${
                      routeName
                        ? `<span style="font-size: 10px; color: #52525b; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${
                            isMAX ? displayName : routeName
                          }</span>`
                        : ""
                    }</div>`;
                  })
                  .join("")}
                ${
                  routes.length > 10
                    ? `<div style="
                        background: #27272a;
                        color: #a1a1aa;
                        padding: 4px 10px;
                        border-radius: 8px;
                        font-size: 11px;
                        font-weight: 500;
                      ">+${routes.length - 10} more</div>`
                    : ""
                }
              </div>
            </div>
          `
          : `<div style="margin-top: 12px; color: #71717a; font-size: 12px; text-align: center; padding: 8px; background: #18181b; border-radius: 8px;">No route information</div>`;

      new mapboxgl.Popup({
        className: "bus-stop-popup",
        maxWidth: "320px",
      })
        .setLngLat(coordinates)
        .setHTML(
          `
          <div style="
            font-family: system-ui, -apple-system, sans-serif;
            min-width: 260px;
            max-width: 300px;
            background: linear-gradient(180deg, #18181b 0%, #09090b 100%);
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          ">
            <!-- Header -->
            <div style="
              background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
              padding: 16px;
              display: flex;
              align-items: center;
              gap: 12px;
            ">
              <div style="
                background: rgba(255,255,255,0.2);
                padding: 10px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
              ">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 6v6"/>
                  <path d="M16 6v6"/>
                  <path d="M2 12h20"/>
                  <path d="M18 18H6a4 4 0 0 1-4-4V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a4 4 0 0 1-4 4Z"/>
                  <circle cx="7" cy="18" r="2"/>
                  <circle cx="17" cy="18" r="2"/>
                </svg>
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="
                  font-size: 15px;
                  font-weight: 700;
                  color: white;
                  line-height: 1.3;
                  word-wrap: break-word;
                ">${name}</div>
                ${
                  code
                    ? `<div style="
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                        margin-top: 4px;
                        background: rgba(255,255,255,0.2);
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        color: rgba(255,255,255,0.9);
                        font-weight: 600;
                      ">
                        <span>Stop #${code}</span>
                      </div>`
                    : ""
                }
              </div>
            </div>

            <!-- Content -->
            <div style="padding: 12px 16px 16px;">
              ${routesHtml}

              <!-- Actions -->
              <div style="
                display: flex;
                gap: 8px;
                margin-top: 16px;
              ">
                <button
                  onclick="navigator.clipboard.writeText('${code || stopId}')"
                  style="
                    flex: 1;
                    background: #27272a;
                    border: 1px solid #3f3f46;
                    border-radius: 10px;
                    padding: 10px;
                    color: #fafafa;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    transition: all 0.2s;
                  "
                  onmouseover="this.style.background='#3f3f46'"
                  onmouseout="this.style.background='#27272a'"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Copy Stop ID
                </button>
                <a
                  href="https://www.google.com/maps/dir/?api=1&destination=${
                    coordinates[1]
                  },${coordinates[0]}&travelmode=walking"
                  target="_blank"
                  style="
                    flex: 1;
                    background: #22c55e;
                    border: none;
                    border-radius: 10px;
                    padding: 10px;
                    color: white;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    text-decoration: none;
                    transition: all 0.2s;
                  "
                  onmouseover="this.style.background='#16a34a'"
                  onmouseout="this.style.background='#22c55e'"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="10" r="3"/>
                    <path d="M12 2a8 8 0 0 0-8 8c0 1.892.402 3.13 1.5 4.5L12 22l6.5-7.5c1.098-1.37 1.5-2.608 1.5-4.5a8 8 0 0 0-8-8Z"/>
                  </svg>
                  Directions
                </a>
              </div>
            </div>
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
        speed: 1.2, // Smooth animation speed
        curve: 1.42, // Smooth easing curve
        essential: true,
      });
    }
  }, [selectedStation]);

  // Handle tracked vehicle - fly to and follow the vehicle
  useEffect(() => {
    if (!trackedVehicle || !mapRef.current) return;
    
    // Enable live trains view automatically for CTrains
    if (trackedVehicle.vehicleType === "CTrain" && !showLiveTrains) {
      setShowLiveTrains(true);
    }
    
    // Automatically show train lines when tracking a CTrain
    if (trackedVehicle.vehicleType === "CTrain" && !showTrainLines) {
      setShowTrainLines(true);
    }
    
    // Find the vehicle by tripId or vehicleId in all vehicles
    const vehicle = allVehicles.find(v => v.tripId === trackedVehicle.tripId) 
      || allVehicles.find(v => v.vehicleId === trackedVehicle.vehicleId);
    
    if (vehicle) {
      // Fly to the vehicle's position with smooth animation (like station search)
      mapRef.current.flyTo({
        center: [vehicle.lng, vehicle.lat],
        zoom: 16,
        pitch: 60,
        bearing: vehicle.bearing,
        speed: 1.2, // Smooth animation speed
        curve: 1.42, // Smooth easing curve
        essential: true, // Animation will happen even if user prefers reduced motion
      });
    }
  }, [trackedVehicle, allVehicles, showLiveTrains, showTrainLines]);

  // Clear route shape when tracked vehicle changes (switching to different vehicle)
  useEffect(() => {
    // When tracked vehicle changes, clear any previously viewed route
    // This prevents old route lines from lingering when switching vehicles
    setViewedRouteShape(null);
  }, [trackedVehicle?.tripId, trackedVehicle?.vehicleId]);

  // Continuously follow tracked vehicle
  useEffect(() => {
    if (!trackedVehicle || !mapRef.current) return;
    
    // Find the vehicle in all vehicles
    const vehicle = allVehicles.find(v => v.tripId === trackedVehicle.tripId) 
      || allVehicles.find(v => v.vehicleId === trackedVehicle.vehicleId);
    
    if (vehicle) {
      mapRef.current.jumpTo({
        center: [vehicle.lng, vehicle.lat],
        bearing: vehicle.bearing,
        pitch: 60,
        zoom: 16,
      });
    }
  }, [trackedVehicle, allVehicles]);

  // Stop tracking and reset map to original state
  const stopTracking = useCallback(() => {
    // Clear tracked vehicle
    setTrackedVehicle(null);
    
    // Clear viewed route shape
    setViewedRouteShape(null);
    
    // Hide train lines (reset to default)
    setShowTrainLines(false);
    
    // Reset map view to original position
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: MAP_CONSTANTS.CENTER,
        zoom: MAP_CONSTANTS.DEFAULT_ZOOM,
        pitch: MAP_CONSTANTS.DEFAULT_PITCH,
        bearing: 0,
        speed: 1.2,
        curve: 1.42,
        essential: true,
      });
    }
  }, [setTrackedVehicle]);

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

  // Helper function to find the segment of track between two points
  const getTrackSegment = useCallback(
    (
      fromCoords: [number, number],
      toCoords: [number, number],
      lineName: string
    ): [number, number][] => {
      // Find ALL route lines for this train line (may have multiple branches)
      const targetLine = lineName.includes("Red") ? "RED" : "BLUE";
      const matchingTracks = routeLines.filter(
        (r) => r.properties.line === targetLine
      );

      if (matchingTracks.length === 0) {
        return [fromCoords, toCoords]; // Fallback to direct line
      }

      // Helper to find closest point index and distance
      const findClosestPoint = (coords: [number, number][], point: [number, number]) => {
        let closestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < coords.length; i++) {
          const dx = coords[i][0] - point[0];
          const dy = coords[i][1] - point[1];
          const dist = dx * dx + dy * dy;
          if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
          }
        }
        return { idx: closestIdx, dist: minDist };
      };

      // Find the track that best covers both endpoints (minimizes total distance to endpoints)
      let bestTrack: [number, number][] | null = null;
      let bestScore = Infinity;
      let bestFromIdx = 0;
      let bestToIdx = 0;

      for (const track of matchingTracks) {
        if (!track.coordinates || track.coordinates.length < 2) continue;
        
        const fromResult = findClosestPoint(track.coordinates, fromCoords);
        const toResult = findClosestPoint(track.coordinates, toCoords);
        
        // Score = sum of distances to both endpoints (lower is better)
        const score = fromResult.dist + toResult.dist;
        
        if (score < bestScore) {
          bestScore = score;
          bestTrack = track.coordinates;
          bestFromIdx = fromResult.idx;
          bestToIdx = toResult.idx;
        }
      }

      if (!bestTrack) {
        return [fromCoords, toCoords];
      }

      // Extract the segment (handle both directions)
      // Only extend to track endpoints if the station is geographically close to the endpoint
      const trackLength = bestTrack.length;
      const trackStart = bestTrack[0];
      const trackEnd = bestTrack[trackLength - 1];
      
      // Calculate distances from from/to coords to track endpoints (squared, for comparison)
      const distToTrackStart = (coords: [number, number]) => {
        const dx = coords[0] - trackStart[0];
        const dy = coords[1] - trackStart[1];
        return dx * dx + dy * dy;
      };
      const distToTrackEnd = (coords: [number, number]) => {
        const dx = coords[0] - trackEnd[0];
        const dy = coords[1] - trackEnd[1];
        return dx * dx + dy * dy;
      };
      
      // Threshold: ~200m in degrees squared (roughly 0.002 degrees = 200m at Calgary's latitude)
      const geoThreshold = 0.002 * 0.002;
      
      let startIdx = bestFromIdx;
      let endIdx = bestToIdx;
      
      // Determine which coord is closer to track start vs end
      const fromIsStart = startIdx < endIdx ? true : false;
      const startCoord = fromIsStart ? fromCoords : toCoords;
      const endCoord = fromIsStart ? toCoords : fromCoords;
      
      // Swap if needed to ensure startIdx <= endIdx
      if (startIdx > endIdx) {
        [startIdx, endIdx] = [endIdx, startIdx];
      }
      
      // Only extend to track start if station is actually near the track start geographically
      if (startIdx < 20 && distToTrackStart(startCoord) < geoThreshold) {
        startIdx = 0;
      }
      
      // Only extend to track end if station is actually near the track end geographically
      if (endIdx > trackLength - 20 - 1 && distToTrackEnd(endCoord) < geoThreshold) {
        endIdx = trackLength - 1;
      }
      
      const segment = bestTrack.slice(startIdx, endIdx + 1);
      
      // Debug logging
      console.log('Track segment extraction:', {
        trackLength,
        bestFromIdx,
        bestToIdx,
        startIdx,
        endIdx,
        segmentLength: segment.length,
        segmentStart: segment[0],
        segmentEnd: segment[segment.length - 1],
        trackStart: bestTrack[0],
        trackEnd: bestTrack[trackLength - 1],
      });
      
      // Ensure the segment starts and ends at the exact station coordinates
      // This fixes gaps between transit and walking segments
      let result: [number, number][];
      
      // Reverse if original direction was reverse
      if (bestFromIdx > bestToIdx) {
        result = segment.reverse();
      } else {
        result = segment;
      }
      
      // Always ensure first point is exactly fromCoords and last is exactly toCoords
      // This guarantees seamless connection with walking segments
      if (result.length > 0) {
        // Check if first point is significantly different from fromCoords
        const firstPoint = result[0];
        const distFromStart = Math.sqrt(
          Math.pow(firstPoint[0] - fromCoords[0], 2) + 
          Math.pow(firstPoint[1] - fromCoords[1], 2)
        );
        if (distFromStart > 0.00005) { // ~5 meters threshold
          result = [fromCoords, ...result];
        }
        
        // Check if last point is significantly different from toCoords
        const lastPoint = result[result.length - 1];
        const distFromEnd = Math.sqrt(
          Math.pow(lastPoint[0] - toCoords[0], 2) + 
          Math.pow(lastPoint[1] - toCoords[1], 2)
        );
        if (distFromEnd > 0.00005) { // ~5 meters threshold
          result = [...result, toCoords];
        }
      } else {
        result = [fromCoords, toCoords];
      }
      
      return result;
    },
    [routeLines]
  );

  // Trip route visualization
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // Clear existing trip layers and markers
    tripMarkersRef.current.forEach((m) => m.remove());
    tripMarkersRef.current = [];

    // Remove existing trip route layers
    if (map.getLayer("trip-walk-route")) {
      map.removeLayer("trip-walk-route");
    }
    if (map.getSource("trip-walk-route")) {
      map.removeSource("trip-walk-route");
    }
    if (map.getLayer("trip-transit-route")) {
      map.removeLayer("trip-transit-route");
    }
    if (map.getLayer("trip-transit-glow")) {
      map.removeLayer("trip-transit-glow");
    }
    if (map.getSource("trip-transit-route")) {
      map.removeSource("trip-transit-route");
    }

    if (!tripPlan?.success || !tripPlan.segments) return;

    // Collect all walking route coordinates
    const walkingCoordinates: [number, number][][] = [];
    const transitRoutes: Array<{
      coordinates: [number, number][];
      color: string;
      vehicleType: string;
    }> = [];
    const transitStops: Array<{
      coords: [number, number];
      name: string;
      type: "origin" | "transit" | "destination";
      vehicleType?: string;
      color?: string;
      routeName?: string;
      stopsCount?: number;
      headsign?: string;
      instruction?: string;
    }> = [];

    tripPlan.segments.forEach((segment, index) => {
      // Add walking route geometry
      if (segment.type === "walk" && segment.geometry?.coordinates) {
        walkingCoordinates.push(
          segment.geometry.coordinates as [number, number][]
        );
      }

      // Add transit route geometry
      if (segment.type === "transit") {
        const fromCoords = segment.from.coordinates;
        const toCoords = segment.to.coordinates;
        // Default colors: CTrain Red=#DC143C, CTrain Blue=#0088FF, Bus=#22c55e
        const color =
          segment.color ||
          (segment.vehicle_type === "CTrain"
            ? segment.line?.includes("Red")
              ? "#DC143C"
              : "#0088FF"
            : "#22c55e");

        // For CTrain, use actual track coordinates
        // For Bus, use geometry from backend if available, otherwise direct line
        let routeCoordinates: [number, number][];

        // First check if backend provided geometry
        if (segment.geometry?.coordinates) {
          // Use backend-provided geometry (works for both CTrain and Bus)
          routeCoordinates = segment.geometry.coordinates as [number, number][];
        } else if (segment.vehicle_type === "CTrain") {
          // Fallback: Extract CTrain segment from local track data
          routeCoordinates = getTrackSegment(
            fromCoords,
            toCoords,
            segment.line || "Red Line"
          );
        } else {
          // Fallback to direct line
          routeCoordinates = [fromCoords, toCoords];
        }

        transitRoutes.push({
          coordinates: routeCoordinates,
          color,
          vehicleType: segment.vehicle_type || "Transit",
        });
      }

      // Collect transit stops for markers
      if (index === 0) {
        transitStops.push({
          coords: segment.from.coordinates,
          name: segment.from.name,
          type: "origin",
        });
      }
      if (segment.type === "transit") {
        transitStops.push({
          coords: segment.from.coordinates,
          name: segment.from.name,
          type: "transit",
          vehicleType: segment.vehicle_type,
          color: segment.color,
          routeName: segment.route_short_name,
          stopsCount: segment.stops_count || segment.num_stops,
          headsign: segment.headsign,
          instruction: segment.instruction,
        });
        transitStops.push({
          coords: segment.to.coordinates,
          name: segment.to.name,
          type: "transit",
          vehicleType: segment.vehicle_type,
          color: segment.color,
          routeName: segment.route_short_name,
        });
      }
      if (index === tripPlan.segments!.length - 1) {
        transitStops.push({
          coords: segment.to.coordinates,
          name: segment.to.name,
          type: "destination",
        });
      }
    });

    // Add walking routes as a single source with multiple lines
    if (walkingCoordinates.length > 0) {
      const features = walkingCoordinates.map((coords) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: coords,
        },
        properties: {},
      }));

      map.addSource("trip-walk-route", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features,
        },
      });

      map.addLayer({
        id: "trip-walk-route",
        type: "line",
        source: "trip-walk-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#8b5cf6", // Purple for walking
          "line-width": 5,
          "line-dasharray": [1, 2], // More dots-like pattern
          "line-opacity": 0.9,
        },
      });
    }

    // Add transit routes with their specific colors
    if (transitRoutes.length > 0) {
      const features = transitRoutes.map((route) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: route.coordinates,
        },
        properties: {
          color: route.color,
          vehicleType: route.vehicleType,
        },
      }));

      map.addSource("trip-transit-route", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features,
        },
      });

      // Glow layer (wider, semi-transparent underneath)
      map.addLayer({
        id: "trip-transit-glow",
        type: "line",
        source: "trip-transit-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 12,
          "line-opacity": 0.3,
          "line-blur": 3,
        },
      });

      // Main route line
      map.addLayer({
        id: "trip-transit-route",
        type: "line",
        source: "trip-transit-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 6,
          "line-opacity": 1,
        },
      });
    }

    // Add markers for origin, transit stops, and destination
    // Filter to remove duplicates (same coords)
    const uniqueStops = transitStops.filter(
      (stop, index, self) =>
        index ===
        self.findIndex(
          (s) =>
            s.coords[0] === stop.coords[0] &&
            s.coords[1] === stop.coords[1] &&
            s.type === stop.type
        )
    );

    uniqueStops.forEach((stop) => {
      const el = document.createElement("div");
      el.className = "trip-marker";

      if (stop.type === "origin") {
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-12 h-12 rounded-full bg-green-500/30 animate-ping"></div>
            <div class="absolute w-10 h-10 rounded-full bg-green-500/20"></div>
            <div class="relative w-9 h-9 bg-linear-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg border-3 border-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
          </div>
        `;
      } else if (stop.type === "destination") {
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-12 h-12 rounded-full bg-red-500/30 animate-ping"></div>
            <div class="absolute w-10 h-10 rounded-full bg-red-500/20"></div>
            <div class="relative w-9 h-9 bg-linear-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center shadow-lg border-3 border-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
          </div>
        `;
      } else {
        // Transit stop - use vehicle-specific color and icon
        const bgColor = stop.color || "#3b82f6"; // Default blue
        const isTrain = stop.vehicleType === "CTrain";
        const icon = isTrain
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.89V19h8V3.89C16 2.3 14.88 1 13.5 1h-3C9.12 1 8 2.3 8 3.89z"/><path d="M12 1v3"/><path d="M8 13h8"/><circle cx="10" cy="17" r="1"/><circle cx="14" cy="17" r="1"/><path d="M5 19h14l-1.5 4H6.5z"/></svg>`
          : `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>`;

        // Show stops count badge only for boarding stops with stopsCount
        const stopsCountBadge = stop.stopsCount && stop.stopsCount > 0 ? `
          <div class="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md border border-gray-200">
            <span class="text-xs font-bold" style="color: ${bgColor}">${stop.stopsCount}</span>
          </div>
        ` : '';

        el.innerHTML = `
          <div class="relative">
            <div class="w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white" style="background-color: ${bgColor}">
              ${icon}
            </div>
            ${stopsCountBadge}
          </div>
        `;
      }

      // Build popup content with route info
      let popupContent = `<div class="p-2">
        <strong>${stop.name}</strong>`;
      
      if (stop.routeName) {
        popupContent += `<br/><span class="text-sm font-medium" style="color: ${stop.color || '#3b82f6'}">${stop.vehicleType === "CTrain" ? `${stop.routeName} Line` : `Route ${stop.routeName}`}</span>`;
      }
      if (stop.stopsCount && stop.stopsCount > 0) {
        popupContent += `<br/><span class="text-xs text-gray-500">${stop.stopsCount} ${stop.stopsCount === 1 ? 'stop' : 'stops'}</span>`;
      }
      if (stop.headsign) {
        popupContent += `<br/><span class="text-xs text-gray-400">→ ${stop.headsign}</span>`;
      }
      popupContent += `</div>`;

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(stop.coords)
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(popupContent)
        )
        .addTo(map);

      tripMarkersRef.current.push(marker);
    });

    // Fit bounds to show the entire route
    if (tripPlan.origin && tripPlan.destination) {
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend(tripPlan.origin.coordinates);
      bounds.extend(tripPlan.destination.coordinates);

      // Extend with all transit stops
      transitStops.forEach((stop) => bounds.extend(stop.coords));

      map.fitBounds(bounds, {
        padding: { top: 100, bottom: 100, left: 400, right: 100 },
        maxZoom: 15,
        duration: 1500,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, tripPlan, getTrackSegment, routeLines, styleChangeCounter]);

  // Handle route calculation from TripPlanner
  const handleRouteCalculated = useCallback((plan: TripPlan) => {
    setTripPlan(plan);
  }, []);

  // Handle clearing route - reset map to original view
  const handleClearRoute = useCallback(() => {
    setTripPlan(null);
    
    // Hide train lines (reset to default)
    setShowTrainLines(false);
    
    // Reset map view to original position
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: MAP_CONSTANTS.CENTER,
        zoom: MAP_CONSTANTS.DEFAULT_ZOOM,
        pitch: MAP_CONSTANTS.DEFAULT_PITCH,
        bearing: 0,
        speed: 1.2,
        curve: 1.42,
        essential: true,
      });
    }
  }, []);

  // Handle "Get Directions" from search result popup
  const handleGetDirections = useCallback(
    (destination: {
      name: string;
      address: string;
      coordinates: [number, number];
    }) => {
      setExternalDestination(destination);
    },
    []
  );

  // Handle clearing search - reset map to original view
  const handleClearSearch = useCallback(() => {
    // Hide train lines (reset to default)
    setShowTrainLines(false);
    
    // Reset map view to original position
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: MAP_CONSTANTS.CENTER,
        zoom: MAP_CONSTANTS.DEFAULT_ZOOM,
        pitch: MAP_CONSTANTS.DEFAULT_PITCH,
        bearing: 0,
        speed: 1.2,
        curve: 1.42,
        essential: true,
      });
    }
  }, []);

  // Clear external destination after it's consumed by TripPlanner
  const handleClearExternalDestination = useCallback(() => {
    setExternalDestination(null);
  }, []);

  // Handle closing station info - reset map and call original callback
  const handleCloseStationInfoWithReset = useCallback(() => {
    // Hide train lines (reset to default)
    setShowTrainLines(false);
    
    // Reset map view to original position
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: MAP_CONSTANTS.CENTER,
        zoom: MAP_CONSTANTS.DEFAULT_ZOOM,
        pitch: MAP_CONSTANTS.DEFAULT_PITCH,
        bearing: 0,
        speed: 1.2,
        curve: 1.42,
        essential: true,
      });
    }
    
    // Call original callback to clear selected station
    onCloseStationInfo();
  }, [onCloseStationInfo]);

  // Get user location
  const getUserLocation = useCallback((flyToLocation: boolean = true) => {
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

        // Fly to user location only if requested
        if (flyToLocation && mapRef.current) {
          mapRef.current.flyTo({
            center: [longitude, latitude],
            zoom: 15,
            pitch: 60,
            duration: 2000,
          });
        }
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
  }, [setUserLocation]);

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

  // Handle View Route click from vehicle popup
  const handleViewRoute = useCallback(async (vehicle: VehiclePositionData) => {
    if (!mapRef.current || !vehicle.routeShortName) return;
    
    try {
      // Fetch route shape from API
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const response = await fetch(`${apiBaseUrl}/routes/${vehicle.routeShortName}/shape`);
      
      if (!response.ok) {
        console.error("Failed to fetch route shape");
        return;
      }
      
      const data = await response.json();
      
      if (data.geometry?.coordinates) {
        setViewedRouteShape({
          routeId: vehicle.routeShortName,
          coordinates: data.geometry.coordinates,
          color: vehicle.color || "#22c55e",
        });
        
        // Fit map to show full route
        const bounds = new mapboxgl.LngLatBounds();
        data.geometry.coordinates.forEach((coord: [number, number]) => {
          bounds.extend(coord);
        });
        
        mapRef.current.fitBounds(bounds, {
          padding: { top: 100, bottom: 100, left: 100, right: 100 },
          duration: 1000,
        });
      }
    } catch (error) {
      console.error("Error fetching route shape:", error);
    }
  }, []);

  // Draw/update route shape on map
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    
    // Remove existing route layer and source
    if (map.getLayer("viewed-route-line")) {
      map.removeLayer("viewed-route-line");
    }
    if (map.getSource("viewed-route")) {
      map.removeSource("viewed-route");
    }
    
    // If no route to display, we're done
    if (!viewedRouteShape) return;
    
    // Add the route line
    map.addSource("viewed-route", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: viewedRouteShape.coordinates,
        },
      },
    });
    
    // Find the first symbol layer to insert the route below labels
    const layers = map.getStyle().layers;
    const labelLayerId = layers?.find(
      layer => layer.type === "symbol" && layer.layout && layer.layout["text-field"]
    )?.id;
    
    map.addLayer({
      id: "viewed-route-line",
      type: "line",
      source: "viewed-route",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": viewedRouteShape.color,
        "line-width": 5,
        "line-opacity": 0.85,
      },
    }, labelLayerId);
    
  }, [viewedRouteShape, mapLoaded, styleChangeCounter]);

  // Auto-fetch user location on page load (silently, without flying)
  useEffect(() => {
    // Only fetch if we don't already have location
    if (!userLocation && !isLocating) {
      getUserLocation(false); // false = don't fly to location
    }
  }, []); // Run once on mount

  return (
    <MapContext.Provider value={{ map: mapInstance }}>
      <div className="flex-1 h-full relative bg-black overflow-hidden">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Vehicle Markers - Render when live trains/buses is enabled OR when tracking any vehicle */}
        {/* Vehicle Markers - Render when live trains/buses is enabled OR when tracking any vehicle */}
        {mapLoaded && (showLiveTrains || showLiveBuses || trackedVehicle) && (
          <VehicleLayer
            map={mapInstance}
            vehicles={allVehicles}
            onViewRoute={handleViewRoute}
            trackedVehicleId={trackedVehicle?.tripId || trackedVehicle?.vehicleId || null}
          />
        )}

        {/* 3D Vehicle Models Layer */}
        {mapLoaded && (showLiveTrains || showLiveBuses || trackedVehicle) && (
          <Vehicle3DLayer
            map={mapInstance}
            vehicles={allVehicles}
          />
        )}

        {/* Map Search - top center */}
        {mapLoaded && <MapSearch onGetDirections={handleGetDirections} onClear={handleClearSearch} />}

        {/* Station Search - top left */}
        {/* {mapLoaded && (
          <StationSearch
            stations={stations}
            onStationSelect={onStationSelect}
          />
        )} */}

        {/* Nearby Arrivals moved to Sidebar */}

        {/* Trip Planner - Google Maps style floating panel */}
        {mapLoaded && (
          <TripPlanner
            userLocation={userLocation}
            onRouteCalculated={handleRouteCalculated}
            onClearRoute={handleClearRoute}
            externalDestination={externalDestination}
            onClearExternalDestination={handleClearExternalDestination}
          />
        )}

        {/* Map Style Switcher - bottom left */}
        {mapLoaded && <MapStyles />}

        {/* Zoom Controls - bottom right */}
        {mapLoaded && <MapControls />}

        {/* Vehicle Tracking Panel - Only show when tracking a vehicle */}
        {trackedVehicle && (
          <div className="absolute bottom-20 left-7 z-10">
            <div className="bg-black/90 backdrop-blur-sm border border-zinc-700 rounded-2xl p-4 min-w-[200px]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {trackedVehicle.vehicleType === "Bus" ? (
                    <Bus className="size-4 text-green-500" />
                  ) : (
                    <Train className={`size-4 ${trackedVehicle.line === "Red" ? "text-red-500" : "text-blue-500"}`} />
                  )}
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    trackedVehicle.vehicleType === "Bus"
                      ? "bg-green-500/20 text-green-400"
                      : trackedVehicle.line === "Red" 
                        ? "bg-red-500/20 text-red-400" 
                        : "bg-blue-500/20 text-blue-400"
                  }`}>
                    {trackedVehicle.routeShortName}
                  </span>
                </div>
                <button
                  onClick={stopTracking}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                  aria-label="Stop tracking"
                >
                  <X className="size-4 text-zinc-400" />
                </button>
              </div>
              <div className="text-sm text-white font-medium truncate">
                {trackedVehicle.headsign}
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                Tracking live {trackedVehicle.vehicleType === "Bus" ? "bus" : "train"} position
              </div>
            </div>
          </div>
        )}

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

          {/* Live Trains Toggle */}
          <button
            onClick={() => setShowLiveTrains(!showLiveTrains)}
            className={`p-3 backdrop-blur-sm border rounded-2xl transition-all ${
              showLiveTrains && hasRealTimeData
                ? "bg-green-600/90 border-green-500 hover:bg-green-500"
                : showLiveTrains && !hasRealTimeData
                ? "bg-amber-600/90 border-amber-500 hover:bg-amber-500"
                : "bg-zinc-900/95 border-zinc-800 hover:bg-zinc-800"
            }`}
            aria-label={
              showLiveTrains ? "Hide live trains" : "Show live trains"
            }
            title={showLiveTrains ? "Hide live trains" : "Show live trains"}
          >
            {isFetchingTrains && showLiveTrains ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : showLiveTrains && hasRealTimeData ? (
              <Wifi className="w-5 h-5 text-white" />
            ) : showLiveTrains && !hasRealTimeData ? (
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

          {/* Live Buses Toggle */}
          <button
            onClick={() => setShowLiveBuses(!showLiveBuses)}
            className={`p-3 backdrop-blur-sm border rounded-2xl transition-all ${
              showLiveBuses && transformedBuses.length > 0
                ? "bg-emerald-600/90 border-emerald-500 hover:bg-emerald-500"
                : showLiveBuses && transformedBuses.length === 0
                ? "bg-amber-600/90 border-amber-500 hover:bg-amber-500"
                : "bg-zinc-900/95 border-zinc-800 hover:bg-zinc-800"
            }`}
            aria-label={showLiveBuses ? "Hide live buses" : "Show live buses"}
            title={showLiveBuses ? "Hide live buses" : "Show live buses"}
          >
            {isFetchingBuses && showLiveBuses ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <span className="text-lg" role="img" aria-label="bus">
                🚌
              </span>
            )}
          </button>

          {/* Train Lines Toggle */}
          <button
            onClick={() => setShowTrainLines(!showTrainLines)}
            className={`p-3 backdrop-blur-sm border rounded-2xl transition-all ${
              showTrainLines
                ? "bg-purple-600/90 border-purple-500 hover:bg-purple-500"
                : "bg-zinc-900/95 border-zinc-800 hover:bg-zinc-800"
            }`}
            aria-label={
              showTrainLines ? "Hide train lines" : "Show train lines"
            }
            title={showTrainLines ? "Hide train lines" : "Show train lines"}
          >
            <Train
              className={`w-5 h-5 ${
                showTrainLines ? "text-white" : "text-zinc-300"
              }`}
            />
          </button>
        </div>

        {/* Train/Bus Status Indicator - Only show when live vehicles is active */}
        {mapLoaded && (showLiveTrains || showLiveBuses) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl backdrop-blur-sm border text-xs font-medium transition-all ${
                hasRealTimeData
                  ? "bg-green-900/80 border-green-700 text-green-200"
                  : isLoadingTrains || isFetchingBuses
                  ? "bg-amber-900/80 border-amber-700 text-amber-200"
                  : isTrainError
                  ? "bg-red-900/80 border-red-700 text-red-200"
                  : "bg-zinc-900/80 border-zinc-700 text-zinc-300"
              }`}
            >
              {hasRealTimeData ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span>
                    LIVE • 
                    {showLiveTrains && ` ${transformedRedTrains.length} Red, ${transformedBlueTrains.length} Blue`}
                    {showLiveTrains && showLiveBuses && " | "}
                    {showLiveBuses && `${transformedBuses.length} Buses`}
                  </span>
                </>
              ) : isLoadingTrains || isFetchingBuses ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Connecting to live data...</span>
                </>
              ) : isTrainError ? (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>Live data unavailable</span>
                </>
              ) : null}
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
          <div className="absolute bottom-9 right-24 bg-[#18181b]/95 backdrop-blur-sm border border-zinc-800/50 rounded-2xl p-5 min-w-[280px] shadow-2xl z-20">
            <button
              onClick={handleCloseStationInfoWithReset}
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
                <div className="bg-amber-500/15 border border-amber-500/25 rounded-lg px-3 py-2">
                  <p className="text-amber-400 font-medium text-xs">
                    ⭐ Downtown Transit Mall
                  </p>
                </div>
              )}
              
              {/* Arrivals Section */}
              <div className="mt-4 pt-3 border-t border-zinc-700/50">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                  Upcoming Arrivals
                </h4>
                {isLoadingArrivals ? (
                  <div className="flex items-center gap-2 text-zinc-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="text-xs">Loading arrivals...</span>
                  </div>
                ) : stationArrivals?.arrivals && stationArrivals.arrivals.length > 0 ? (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {stationArrivals.arrivals.slice(0, 6).map((arrival, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Train
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: arrival.color }}
                          />
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: arrival.color, color: 'white' }}
                          >
                            {arrival.route_short_name}
                          </span>
                          <span className="text-xs text-zinc-300 truncate">
                            {arrival.headsign}
                          </span>
                        </div>
                        <span
                          className={`text-sm font-bold shrink-0 ml-2 ${getArrivalUrgencyColor(arrival.minutes_away)}`}
                        >
                          {formatArrivalTime(arrival.minutes_away)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">No upcoming arrivals</p>
                )}
              </div>
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
  theme: "dark" | "light" = "dark",
  showTrainLines: boolean = false
) {
  const layers = map.getStyle().layers;
  const labelLayerId = layers?.find(
    (layer) =>
      layer.type === "symbol" && layer.layout && layer.layout["text-field"]
  )?.id;

  // Theme-aware building colors
  const buildingColor = theme === "dark" ? "#444" : "#d1d5db";
  const buildingOpacity = theme === "dark" ? 0.6 : 0.7;

  // Remove existing 3d-buildings layer if exists (to handle style changes)
  if (map.getLayer("3d-buildings")) {
    map.removeLayer("3d-buildings");
  }

  // Add 3D buildings layer - check if the source has building data
  try {
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
  } catch (e) {
    console.warn("Could not add 3D buildings layer:", e);
  }

  // Handle train line visibility
  routeLines.forEach((route, index) => {
    const id = `route-${index}`;

    // Remove existing layer/source if exists
    if (map.getLayer(id)) {
      map.removeLayer(id);
    }
    if (map.getSource(id)) {
      map.removeSource(id);
    }

    // Only add if showTrainLines is true
    if (showTrainLines) {
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
      );
    }
  });
}

export default Map;
