import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Station, RouteLine, CTrainPosition } from "@/types";
import { useCTrainPositionsByLine, useBusStops, useBusPositions } from "@/hooks/queries";
import TripPlanner from "./TripPlanner";
import TripSheet from "./trip/trip-sheet";
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
  MapPin,
} from "lucide-react";
import { MapContext } from "@/context/map-context";
import MapStyles from "@/components/map/map-styles";
import MapControls from "@/components/map/map-controls";
import StationSheet from "@/components/map/station-sheet";
import VehicleLayer, {
  type VehiclePositionData,
} from "@/components/map/vehicle-layer";
import { vehicleAnimator } from "@/lib/vehicle-animator";
import Vehicle3DLayer from "@/components/map/Vehicle3DLayer";
import { ErrorBoundary } from "./shared/ErrorBoundary";
import { MAP_CONSTANTS } from "@/lib/mapbox/constants";
import {
  resolveLegGeometry,
  slicePolylineBetween,
  distanceMeters as geoDistanceMeters,
  type LngLat,
} from "@/lib/geo/polyline";
import { useTheme } from "@/stores/use-theme-store";
import { useMapStore } from "@/stores/useMapStore";
import { useSidebar } from "@/components/ui/sidebar";
import { useStationArrivals } from "@/hooks/useArrivals";
import { useIsMobile } from "@/hooks/use-mobile";
import { LocationMarker } from "./location-marker";
import { LocationPopup } from "./location-popup";

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
  const isMobile = useIsMobile();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [userLocation, setUserLocationLocal] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Get store values
  const { 
    setUserLocation: setUserLocationStore, 
    trackedVehicle, 
    setTrackedVehicle,
    setMapInstance: setMapInstanceStore,
    selectedLocations,
    searchResult,
    setSearchResult
  } = useMapStore();

  useEffect(() => {
    if (mapInstance) {
      setMapInstanceStore(mapInstance);
    }
    return () => {
      setMapInstanceStore(null);
    };
  }, [mapInstance, setMapInstanceStore]);

  // Sync local user location to store
  const setUserLocation = useCallback(
    (location: { lng: number; lat: number } | null) => {
      setUserLocationLocal(location);
      setUserLocationStore(location);
    },
    [setUserLocationStore]
  );


  // Visibility toggles - from store so sidebar/dashboard can control it
  const { 
    showLiveTrains, 
    setShowLiveTrains, 
    showLiveBuses, 
    setShowLiveBuses,
    showBusStops,
    setShowBusStops,
    showTrainLines,
    setShowTrainLines
  } = useMapStore();
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
    } else if (showLiveTrains && !isTrackingBus && !isTrackingTrain) {
      // Only show all trains when NOT in any tracking mode
      vehicles.push(...transformedRedTrains, ...transformedBlueTrains);
    }
    
    // If tracking a specific bus, ONLY show that bus - ignore showLiveBuses toggle
    // If the bus hasn't appeared in the live feed yet (trackedBusPosition=null),
    // show nothing rather than falling through to show ALL buses.
    if (isTrackingBus && trackedBusPosition) {
      vehicles.push(trackedBusPosition);
    } else if (showLiveBuses && !isTrackingBus && !isTrackingTrain) {
      // Only show all buses when NOT in any tracking mode
      vehicles.push(...transformedBuses);
    }
    
    return vehicles;
  }, [transformedRedTrains, transformedBlueTrains, transformedBuses, trackedBusPosition, trackedTrainPosition, showLiveTrains, showLiveBuses, isTrackingBus, isTrackingTrain]);

  // Check if real-time data is available
  const hasRealTimeData =
    transformedRedTrains.length > 0 || transformedBlueTrains.length > 0 || transformedBuses.length > 0 || !!trackedBusPosition || !!trackedTrainPosition;

  // Feed raw positions into the shared animator; markers, 3D models and the
  // camera follow all read smooth interpolated positions from it each frame.
  useEffect(() => {
    vehicleAnimator.setVehicles(allVehicles);
  }, [allVehicles]);

  useEffect(() => {
    return () => vehicleAnimator.clear();
  }, []);

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
    markersRef.current = [];

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
    const handleStopClick = (e: mapboxgl.MapLayerMouseEvent) => {
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
    };

    const handleStopEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleStopLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    // Zoom to cluster on click
    const handleClusterClick = (e: mapboxgl.MapMouseEvent) => {
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
    };

    map.on("click", "bus-stops-layer", handleStopClick);
    map.on("mouseenter", "bus-stops-layer", handleStopEnter);
    map.on("mouseleave", "bus-stops-layer", handleStopLeave);
    map.on("click", "bus-stops-clusters", handleClusterClick);
    map.on("mouseenter", "bus-stops-clusters", handleStopEnter);
    map.on("mouseleave", "bus-stops-clusters", handleStopLeave);

    // Without this cleanup, handlers stack up on every toggle and each stop
    // click spawns duplicate popups.
    return () => {
      map.off("click", "bus-stops-layer", handleStopClick);
      map.off("mouseenter", "bus-stops-layer", handleStopEnter);
      map.off("mouseleave", "bus-stops-layer", handleStopLeave);
      map.off("click", "bus-stops-clusters", handleClusterClick);
      map.off("mouseenter", "bus-stops-clusters", handleStopEnter);
      map.off("mouseleave", "bus-stops-clusters", handleStopLeave);
    };
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

  // Auto-enable relevant layers when tracking a CTrain
  useEffect(() => {
    if (!trackedVehicle || trackedVehicle.vehicleType !== "CTrain") return;
    if (!showLiveTrains) setShowLiveTrains(true);
    if (!showTrainLines) setShowTrainLines(true);
  }, [trackedVehicle, showLiveTrains, showTrainLines, setShowLiveTrains, setShowTrainLines]);

  // Camera-follow state: which animator id we're following, and whether the
  // per-frame follow is active (initial fly-to done, user hasn't taken over).
  const followRef = useRef<{ trackKey: string | null; animId: string | null; active: boolean }>({
    trackKey: null,
    animId: null,
    active: false,
  });

  // Fly to the tracked vehicle ONCE when tracking starts (or when the vehicle
  // first appears in the feed), then hand off to the smooth per-frame follow.
  useEffect(() => {
    const map = mapRef.current;
    if (!trackedVehicle || !map) {
      followRef.current = { trackKey: null, animId: null, active: false };
      return;
    }

    const trackKey = trackedVehicle.tripId || trackedVehicle.vehicleId || null;
    if (!trackKey || followRef.current.trackKey === trackKey) return;

    const vehicle = allVehicles.find(v => v.tripId === trackedVehicle.tripId)
      || allVehicles.find(v => v.vehicleId === trackedVehicle.vehicleId);
    if (!vehicle) return; // Wait until the vehicle shows up in the live feed

    followRef.current = { trackKey, animId: vehicle.id, active: false };

    map.flyTo({
      center: [vehicle.lng, vehicle.lat],
      zoom: 16,
      pitch: 60,
      bearing: vehicle.bearing,
      speed: 1.2,
      curve: 1.42,
      essential: true,
    });

    map.once("moveend", () => {
      if (followRef.current.trackKey === trackKey) {
        followRef.current.active = true;
      }
    });
  }, [trackedVehicle, allVehicles]);

  // Smooth continuous follow: re-center every animation frame on the
  // interpolated position. Pauses as soon as the user grabs the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!trackedVehicle || !map) return;

    const pauseFollow = () => {
      followRef.current.active = false;
    };
    map.on("dragstart", pauseFollow);
    map.on("rotatestart", pauseFollow);
    map.on("pitchstart", pauseFollow);
    map.on("wheel", pauseFollow);

    const unsubscribe = vehicleAnimator.subscribe(() => {
      const follow = followRef.current;
      if (!follow.active || !follow.animId) return;

      const pos = vehicleAnimator.getPosition(follow.animId);
      if (!pos) return;

      map.jumpTo({
        center: [pos.lng, pos.lat],
        bearing: pos.bearing,
      });
    });

    return () => {
      map.off("dragstart", pauseFollow);
      map.off("rotatestart", pauseFollow);
      map.off("pitchstart", pauseFollow);
      map.off("wheel", pauseFollow);
      unsubscribe();
    };
  }, [trackedVehicle]);

  // Clear route shape when tracked vehicle changes (switching to different vehicle)
  useEffect(() => {
    // When tracked vehicle changes, clear any previously viewed route
    // This prevents old route lines from lingering when switching vehicles
    setViewedRouteShape(null);
  }, [trackedVehicle?.tripId, trackedVehicle?.vehicleId]);

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
  }, [setTrackedVehicle, setShowTrainLines]);

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

  // Slice the correct CTrain track polyline to the boarding→alighting span.
  // Picks the track branch whose geometry actually passes near *both* stops and
  // whose sliced length is close to the straight-line distance — anything that
  // loops out to the end of the line and back is rejected in favour of a clean
  // straight segment.
  const getTrackSegment = useCallback(
    (
      fromCoords: [number, number],
      toCoords: [number, number],
      lineName: string
    ): [number, number][] => {
      const targetLine = lineName.includes("Red") ? "RED" : "BLUE";
      const tracks = routeLines.filter(
        (r) =>
          r.properties.line === targetLine &&
          r.coordinates &&
          r.coordinates.length >= 2
      );
      if (tracks.length === 0) return [fromCoords, toCoords];

      const straight = geoDistanceMeters(fromCoords as LngLat, toCoords as LngLat);
      const maxLen = Math.max(straight * 2.8, straight + 1500);

      let best: [number, number][] | null = null;
      let bestScore = Infinity;
      for (const track of tracks) {
        const sliced = slicePolylineBetween(
          track.coordinates as LngLat[],
          fromCoords as LngLat,
          toCoords as LngLat
        );
        if (sliced.fromOffsetMeters > 400 || sliced.toOffsetMeters > 400) continue;
        if (sliced.lengthMeters > maxLen) continue;
        const score = sliced.fromOffsetMeters + sliced.toOffsetMeters;
        if (score < bestScore) {
          bestScore = score;
          best = [
            fromCoords,
            ...sliced.coords.slice(1, -1),
            toCoords,
          ] as [number, number][];
        }
      }

      return best ?? [fromCoords, toCoords];
    },
    [routeLines]
  );

  // Auto-dismiss the location error toast so it never blocks the UI
  useEffect(() => {
    if (!locationError) return;
    const timeoutId = setTimeout(() => setLocationError(null), 5000);
    return () => clearTimeout(timeoutId);
  }, [locationError]);

  // Caches of fetched walking paths / route shapes so re-renders don't refetch
  // (globalThis.Map: the bare name is shadowed by this component)
  const walkPathCacheRef = useRef<Map<string, [number, number][]>>(new globalThis.Map());
  const routeShapeCacheRef = useRef<Map<string, [number, number][]>>(new globalThis.Map());

  // Trip route visualization
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    let cancelled = false;

    // Clear existing trip layers and markers
    tripMarkersRef.current.forEach((m) => m.remove());
    tripMarkersRef.current = [];

    // Remove existing trip route layers
    ["trip-walk-route", "trip-walk-casing", "trip-transit-route", "trip-transit-casing", "trip-transit-glow"].forEach((layerId) => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    });
    ["trip-walk-route", "trip-transit-route"].forEach((sourceId) => {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    });

    if (!tripPlan?.success || !tripPlan.segments) return;

    // Walk segments may need street-following geometry fetched asynchronously
    const walkSegments: Array<{
      from: [number, number];
      to: [number, number];
      coords: [number, number][] | null;
    }> = [];
    const transitRoutes: Array<{
      // null = no geometry from the backend; resolved from the route's
      // GTFS shape inside draw()
      coordinates: [number, number][] | null;
      color: string;
      vehicleType: string;
      from: [number, number];
      to: [number, number];
      routeShortName?: string;
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
      // Collect walking segments (geometry resolved in draw() below)
      if (segment.type === "walk") {
        walkSegments.push({
          from: segment.from.coordinates,
          to: segment.to.coordinates,
          coords: (segment.geometry?.coordinates as [number, number][]) ?? null,
        });
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

        let routeCoordinates: [number, number][] | null;

        const backendShape = segment.geometry?.coordinates as
          | LngLat[]
          | undefined;

        // The backend now trims each transit leg to the boarding→alighting span
        // and pins the exact stop coordinates as endpoints, so a multi-point
        // shape can be drawn as-is — it already follows the road / rail.
        const backendShapeUsable = !!backendShape && backendShape.length >= 3;

        if (segment.vehicle_type === "CTrain") {
          // Prefer the real rail alignment we already have loaded. Fall back to
          // the backend shape, then a straight line.
          const viaTrack = getTrackSegment(
            fromCoords,
            toCoords,
            segment.line || "Red Line"
          );
          if (viaTrack.length > 2) {
            routeCoordinates = viaTrack;
          } else if (backendShapeUsable) {
            routeCoordinates = [
              fromCoords,
              ...(backendShape!.slice(1, -1) as [number, number][]),
              toCoords,
            ];
          } else {
            routeCoordinates = resolveLegGeometry(
              backendShape,
              fromCoords as LngLat,
              toCoords as LngLat
            ).coords as [number, number][];
          }
        } else if (backendShapeUsable) {
          // Use the backend's road-following shape directly.
          routeCoordinates = [
            fromCoords,
            ...(backendShape!.slice(1, -1) as [number, number][]),
            toCoords,
          ];
        } else if (backendShape) {
          routeCoordinates = resolveLegGeometry(
            backendShape,
            fromCoords as LngLat,
            toCoords as LngLat
          ).coords as [number, number][];
        } else {
          // No geometry at all — fetch the route's GTFS shape in draw() instead
          // of drawing a straight line across town.
          routeCoordinates = null;
        }

        transitRoutes.push({
          coordinates: routeCoordinates,
          color,
          vehicleType: segment.vehicle_type || "Transit",
          from: fromCoords,
          to: toCoords,
          routeShortName: segment.route_short_name,
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

    const draw = async () => {
      // Resolve walking geometry: prefer backend street paths; for straight
      // 2-point fallbacks over ~120m, fetch a real path from Mapbox.
      const walkingCoordinates: [number, number][][] = [];
      for (const walk of walkSegments) {
        if (approxDistanceMeters(walk.from, walk.to) < 10) continue;
        let coords = walk.coords;
        if (
          (!coords || coords.length < 3) &&
          approxDistanceMeters(walk.from, walk.to) > 120 &&
          mapboxToken
        ) {
          const fetched = await fetchWalkingPath(
            walk.from,
            walk.to,
            mapboxToken,
            walkPathCacheRef.current
          );
          if (fetched) coords = fetched;
        }
        if (!coords || coords.length < 2) coords = [walk.from, walk.to];
        walkingCoordinates.push(coords);
      }

      // Resolve transit legs that came without geometry (typically buses):
      // fetch the route's GTFS shape and trim it to the boarding→alighting
      // span, so the line follows the actual roads instead of cutting
      // straight across the city.
      for (const route of transitRoutes) {
        if (!route.coordinates && route.routeShortName) {
          const shape = await fetchRouteShape(
            route.routeShortName,
            routeShapeCacheRef.current
          );
          if (shape) {
            // Bus shapes span the whole route in one direction; slice to the
            // ridden span, and drop back to a straight line if the shape
            // doesn't line up with both stops.
            route.coordinates = resolveLegGeometry(
              shape as LngLat[],
              route.from as LngLat,
              route.to as LngLat,
              { maxOffsetMeters: 250, detourFactor: 2.2, slackMeters: 800 }
            ).coords as [number, number][];
          }
        }
        if (!route.coordinates) route.coordinates = [route.from, route.to];
      }

      // The fetches above are async — bail out if the trip changed meanwhile
      if (cancelled || !mapRef.current || !map.getStyle()) return;

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

        // Google-style walking path: a trail of round blue dots
        // (zero-length dashes + round caps render as circles)
        map.addLayer({
          id: "trip-walk-route",
          type: "line",
          source: "trip-walk-route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#4285F4",
            "line-width": 6,
            "line-dasharray": [0, 2.2],
            "line-opacity": 1,
          },
        });
      }

    // Add transit routes with their specific colors
    if (transitRoutes.length > 0) {
      const features = transitRoutes.map((route) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          // Resolved above; fallback kept for the type system
          coordinates: route.coordinates ?? [route.from, route.to],
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

      // Google/Apple-style transit line: solid route color over a white casing
      map.addLayer({
        id: "trip-transit-casing",
        type: "line",
        source: "trip-transit-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#ffffff",
          "line-width": 10,
          "line-opacity": 0.95,
        },
      });

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
        // Google-style origin: small white dot with a dark ring
        el.innerHTML = `
          <div style="
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #ffffff;
            border: 4px solid #1f2937;
            box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          "></div>
        `;
      } else if (stop.type === "destination") {
        // Google-style destination: red teardrop pin anchored at its tip
        el.innerHTML = `
          <svg width="34" height="44" viewBox="0 0 34 44" style="display:block; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
            <path d="M17 1C8.7 1 2 7.7 2 16c0 10.5 13.1 25.4 14.4 26.6a1 1 0 0 0 1.2 0C18.9 41.4 32 26.5 32 16 32 7.7 25.3 1 17 1Z" fill="#EA4335" stroke="#ffffff" stroke-width="2"/>
            <circle cx="17" cy="16" r="5.5" fill="#7f1d1d"/>
          </svg>
        `;
      } else {
        // Transfer/boarding stop: small white circle ringed in the route color
        const ringColor = stop.color || "#3b82f6";
        el.innerHTML = `
          <div style="
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #ffffff;
            border: 3.5px solid ${ringColor};
            box-shadow: 0 1px 3px rgba(0,0,0,0.35);
            cursor: pointer;
          "></div>
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

      const marker = new mapboxgl.Marker({
        element: el,
        // The pin's tip must sit on the destination; dots center on theirs
        anchor: stop.type === "destination" ? "bottom" : "center",
      })
        .setLngLat(stop.coords)
        .setPopup(
          new mapboxgl.Popup({ offset: stop.type === "destination" ? 44 : 14 }).setHTML(popupContent)
        )
        .addTo(map);

      tripMarkersRef.current.push(marker);
    });

      // Fit bounds to show the entire route (stops AND drawn geometry, so
      // looping bus shapes or long walk paths never fall outside the view)
      if (tripPlan.origin && tripPlan.destination) {
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend(tripPlan.origin.coordinates);
        bounds.extend(tripPlan.destination.coordinates);
        transitStops.forEach((stop) => bounds.extend(stop.coords));
        transitRoutes.forEach((route) =>
          route.coordinates?.forEach((c) => bounds.extend(c))
        );
        walkingCoordinates.forEach((coords) =>
          coords.forEach((c) => bounds.extend(c))
        );

        map.fitBounds(bounds, {
          // Desktop: leave room for the trip panel on the right.
          // Mobile: the panel overlays the top, so pad there instead.
          padding: isMobile
            ? { top: 220, bottom: 80, left: 40, right: 40 }
            : { top: 100, bottom: 100, left: 120, right: 420 },
          maxZoom: 15,
          duration: 1500,
          // Overhead view for the route overview, like Google/Apple directions
          pitch: 0,
          bearing: 0,
        });
      }
    };

    draw();

    return () => {
      cancelled = true;
    };
  }, [mapLoaded, tripPlan, getTrackSegment, routeLines, styleChangeCounter, isMobile, mapboxToken]);

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
  }, [setShowTrainLines]);

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
  }, [onCloseStationInfo, setShowTrainLines]);

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
      <div className="flex-1 h-full w-full relative bg-black overflow-hidden">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

        {/* Vehicle Markers - Render when live trains/buses is enabled OR when tracking any vehicle */}
        {mapLoaded && (showLiveTrains || showLiveBuses || trackedVehicle) && (
          <VehicleLayer
            map={mapInstance}
            vehicles={allVehicles}
            onViewRoute={handleViewRoute}
            trackedVehicleId={trackedVehicle?.tripId || trackedVehicle?.vehicleId || null}
          />
        )}

        {/* 3D Vehicle Models Layer - Always mounted but conditionally active to prevent unmount crashes */}
        {mapLoaded && (
          <ErrorBoundary fallback={<div className="hidden" />}>
            <Vehicle3DLayer
              map={mapInstance}
              vehicles={allVehicles}
              isVisible={!!(showLiveTrains || showLiveBuses || trackedVehicle)}
            />
          </ErrorBoundary>
        )}

        {/* Station Search - top left */}
        {/* {mapLoaded && (
          <StationSearch
            stations={stations}
            onStationSelect={onStationSelect}
          />
        )} */}

        {/* Nearby Arrivals moved to Sidebar */}

        {/* Trip planner — Google Maps style bottom sheet on mobile, floating panel on desktop */}
        {mapLoaded &&
          (isMobile ? (
            <TripSheet
              userLocation={userLocation}
              onRouteCalculated={handleRouteCalculated}
              onClearRoute={handleClearRoute}
              externalDestination={externalDestination}
              onClearExternalDestination={handleClearExternalDestination}
            />
          ) : (
            <TripPlanner
              userLocation={userLocation}
              onRouteCalculated={handleRouteCalculated}
              onClearRoute={handleClearRoute}
              externalDestination={externalDestination}
              onClearExternalDestination={handleClearExternalDestination}
            />
          ))}

        {/* Map Style Switcher - bottom left */}
        {mapLoaded && <MapStyles />}

        {/* Zoom Controls - bottom right */}
        {mapLoaded && <MapControls />}

        {/* Vehicle Tracking Panel - Only show when tracking a vehicle */}
        {trackedVehicle && (
          <div className="absolute bottom-20 left-4 xl:left-7 z-10 max-w-[min(280px,calc(100vw-6rem))] mb-safe">
            <div className="bg-black/90 backdrop-blur-xl border border-zinc-700 rounded-2xl p-3 xl:p-4 min-w-[180px] xl:min-w-[200px]">
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
                  className="-m-1.5 p-1.5 hover:bg-white/10 rounded-lg transition-colors"
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
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5 xl:gap-2">
          {/* Reset View Button */}
          <button
            onClick={() =>
              mapRef.current?.flyTo({
                center: MAP_CONSTANTS.CENTER,
                zoom: MAP_CONSTANTS.DEFAULT_ZOOM,
                pitch: MAP_CONSTANTS.DEFAULT_PITCH,
                bearing: 0,
                speed: MAP_CONSTANTS.CAMERA.SPEED,
                curve: MAP_CONSTANTS.CAMERA.CURVE,
                essential: true,
              })
            }
            className="p-2.5 xl:p-3 bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-2xl hover:bg-zinc-800 active:bg-zinc-700 transition-all"
            aria-label="Reset map view"
          >
            <Zap className="w-5 h-5 text-zinc-300" />
          </button>

          {/* My Location Button */}
          <button
            onClick={flyToUserLocation}
            disabled={isLocating}
            className={`p-2.5 xl:p-3 backdrop-blur-sm border rounded-2xl transition-all ${
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

          {/* Transit Layers Toggles - Hidden on mobile to keep view clean, managed via dashboard */}
          {!isMobile && (
            <>
              {/* Live Trains Toggle */}
              <button
                onClick={() => setShowLiveTrains(!showLiveTrains)}
                className={`p-2.5 xl:p-3 backdrop-blur-sm border rounded-2xl transition-all ${
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
                className={`p-2.5 xl:p-3 backdrop-blur-sm border rounded-2xl transition-all ${
                  showBusStops
                    ? "bg-green-600/90 border-green-500 hover:bg-green-500"
                    : "bg-zinc-900/95 border-zinc-800 hover:bg-zinc-800"
                }`}
                aria-label={showBusStops ? "Hide bus stops" : "Show bus stops"}
                title={showBusStops ? "Hide bus stops" : "Show bus stops"}
              >
                <MapPin
                  className={`w-5 h-5 ${
                    showBusStops ? "text-white" : "text-zinc-300"
                  }`}
                />
              </button>

              {/* Live Buses Toggle */}
              <button
                onClick={() => setShowLiveBuses(!showLiveBuses)}
                className={`p-2.5 xl:p-3 backdrop-blur-sm border rounded-2xl transition-all ${
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
                  <Bus
                    className={`w-5 h-5 ${
                      showLiveBuses ? "text-white" : "text-zinc-300"
                    }`}
                  />
                )}
              </button>

              {/* Train Lines Toggle */}
              <button
                onClick={() => setShowTrainLines(!showTrainLines)}
                className={`p-2.5 xl:p-3 backdrop-blur-sm border rounded-2xl transition-all ${
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
            </>
          )}
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

        {/* Selected Station Info — bottom sheet on mobile (drag to dismiss),
            floating card on desktop. Enter and exit share one path. */}
        <StationSheet
          station={selectedStation}
          isMobile={isMobile}
          onClose={handleCloseStationInfoWithReset}
          arrivals={stationArrivals?.arrivals}
          isLoadingArrivals={isLoadingArrivals}
        />
      </div>
      {selectedLocations.map((location) => (
        <LocationMarker
          key={location.properties.mapbox_id}
          location={location}
          onClick={(data) => setSearchResult(data)}
          isSelected={
            searchResult?.properties.mapbox_id ===
            location.properties.mapbox_id
          }
        />
      ))}

      {searchResult && (
        <LocationPopup
          location={searchResult}
          onClose={() => setSearchResult(null)}
        />
      )}
    </MapContext.Provider>
  );
};

function approxDistanceMeters(a: [number, number], b: [number, number]): number {
  const dLat = (b[1] - a[1]) * 111320;
  const dLng = (b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** Full GTFS shape for a route, from the backend. */
async function fetchRouteShape(
  routeShortName: string,
  cache: Map<string, [number, number][]>
): Promise<[number, number][] | null> {
  const cached = cache.get(routeShortName);
  if (cached) return cached;
  try {
    const apiBaseUrl =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
    const res = await fetch(
      `${apiBaseUrl}/routes/${encodeURIComponent(routeShortName)}/shape`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data.geometry?.coordinates as [number, number][] | undefined;
    if (coords && coords.length >= 2) {
      cache.set(routeShortName, coords);
      return coords;
    }
  } catch {
    // Caller falls back to a straight line
  }
  return null;
}

/** Street-following walking path from the Mapbox Directions API. */
async function fetchWalkingPath(
  from: [number, number],
  to: [number, number],
  token: string,
  cache: Map<string, [number, number][]>
): Promise<[number, number][] | null> {
  const key = `${from[0].toFixed(5)},${from[1].toFixed(5)}|${to[0].toFixed(5)},${to[1].toFixed(5)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/walking/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${token}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data.routes?.[0]?.geometry?.coordinates as
      | [number, number][]
      | undefined;
    if (coords && coords.length >= 2) {
      cache.set(key, coords);
      return coords;
    }
  } catch {
    // Network failure → caller falls back to a straight line
  }
  return null;
}

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
