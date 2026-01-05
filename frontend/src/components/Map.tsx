import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Station, RouteLine, CTrainPosition } from "@/types";
import { useTrainSimulation } from "@/hooks/useTrainSimulation";
import { useCTrainPositionsByLine, useBusStops } from "@/hooks/queries";
import TrainControls from "./TrainControls";
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
  Play,
} from "lucide-react";
import { MapContext } from "@/context/map-context";
import MapSearch from "@/components/map/map-search";
import MapStyles from "@/components/map/map-styles";
import MapControls from "@/components/map/map-controls";
import StationSearch from "@/components/map/station-search";
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

  // Live trains visibility toggle (hidden by default)
  const [showLiveTrains, setShowLiveTrains] = useState(false);

  // Simulation visibility toggle (hidden by default)
  const [showSimulation, setShowSimulation] = useState(false);

  // Bus stops visibility toggle
  const [showBusStops, setShowBusStops] = useState(false);

  // Train lines visibility toggle (hidden by default, shown when directions active)
  const [showTrainLines, setShowTrainLines] = useState(false);
  // Ref to track showTrainLines for style.load event
  const showTrainLinesRef = useRef(showTrainLines);

  // Trip planning state
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const tripMarkersRef = useRef<mapboxgl.Marker[]>([]);

  // External destination for "Get Directions" from search results
  const [externalDestination, setExternalDestination] = useState<{
    name: string;
    address: string;
    coordinates: [number, number];
  } | null>(null);

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
    enabled: showLiveTrains && mapLoaded, // Only fetch when live trains toggle is on
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
      // Initial setup - train lines hidden by default
      setupMapLayers(map, routeLines, resolvedTheme, false);
    });

    // Re-add layers when style changes (e.g., from MapStyles component or theme change)
    map.on("style.load", () => {
      // Get the current theme from the store
      const currentTheme = useTheme.getState().resolvedTheme;
      // Preserve current showTrainLines state on style changes using ref
      setupMapLayers(map, routeLines, currentTheme, showTrainLinesRef.current);
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

      // Create routes display HTML - show route number with name
      const routesHtml =
        routes.length > 0
          ? `<div style="margin-top: 8px;">
              <p style="margin: 0 0 6px; font-size: 11px; color: #888; font-weight: 500;">Routes serving this stop:</p>
              <div style="display: flex; flex-direction: column; gap: 4px; max-height: 150px; overflow-y: auto;">
                ${routes
                  .slice(0, 8)
                  .map((r, idx) => {
                    // Try to find a matching route name
                    const routeName =
                      routeNames[idx] ||
                      routeNames.find((n) =>
                        n?.toLowerCase().includes(r.toLowerCase())
                      ) ||
                      "";
                    return `<div style="display: flex; align-items: center; gap: 6px;">
                      <span style="background: #22c55e; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; min-width: 28px; text-align: center;">${r}</span>
                      ${
                        routeName
                          ? `<span style="font-size: 11px; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${routeName}</span>`
                          : ""
                      }
                    </div>`;
                  })
                  .join("")}
                ${
                  routes.length > 8
                    ? `<span style="color: #666; font-size: 11px; padding-top: 4px;">+${
                        routes.length - 8
                      } more routes</span>`
                    : ""
                }
              </div>
            </div>`
          : "";

      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(
          `
          <div style="padding: 10px; font-family: system-ui; min-width: 200px; max-width: 280px;">
            <strong style="font-size: 14px; color: #111;">${name}</strong>
            ${
              code
                ? `<p style="margin: 4px 0 0; font-size: 12px; color: #666;">Stop #${code}</p>`
                : ""
            }
            ${routesHtml}
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

  // Helper function to find the segment of track between two points
  const getTrackSegment = useCallback(
    (
      fromCoords: [number, number],
      toCoords: [number, number],
      lineName: string
    ): [number, number][] => {
      // Find the route line for this train line
      const targetLine = lineName.includes("Red") ? "RED" : "BLUE";
      const trackLine = routeLines.find(
        (r) => r.properties.line === targetLine
      );

      if (!trackLine || trackLine.coordinates.length < 2) {
        return [fromCoords, toCoords]; // Fallback to direct line
      }

      const coords = trackLine.coordinates;

      // Find closest point indices on the track for from and to
      const findClosestIndex = (point: [number, number]): number => {
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
        return closestIdx;
      };

      const fromIdx = findClosestIndex(fromCoords);
      const toIdx = findClosestIndex(toCoords);

      // Extract the segment (handle both directions)
      if (fromIdx <= toIdx) {
        return coords.slice(fromIdx, toIdx + 1);
      } else {
        return coords.slice(toIdx, fromIdx + 1).reverse();
      }
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

        if (segment.vehicle_type === "CTrain") {
          // Extract the segment of track between stations
          routeCoordinates = getTrackSegment(
            fromCoords,
            toCoords,
            segment.line || "Red Line"
          );
        } else if (segment.geometry?.coordinates) {
          // Bus with road geometry from backend
          routeCoordinates = segment.geometry.coordinates as [number, number][];
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
        });
        transitStops.push({
          coords: segment.to.coordinates,
          name: segment.to.name,
          type: "transit",
          vehicleType: segment.vehicle_type,
          color: segment.color,
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
          "line-color": "#6366f1",
          "line-width": 4,
          "line-dasharray": [2, 2],
          "line-opacity": 0.8,
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
          "line-opacity": 0.9,
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
          <div class="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
        `;
      } else if (stop.type === "destination") {
        el.innerHTML = `
          <div class="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
        `;
      } else {
        // Transit stop - use vehicle-specific color and icon
        const bgColor = stop.color || "#3b82f6"; // Default blue
        const isTrain = stop.vehicleType === "CTrain";
        const icon = isTrain
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.89V19h8V3.89C16 2.3 14.88 1 13.5 1h-3C9.12 1 8 2.3 8 3.89z"/><path d="M12 1v3"/><path d="M8 13h8"/><circle cx="10" cy="17" r="1"/><circle cx="14" cy="17" r="1"/><path d="M5 19h14l-1.5 4H6.5z"/></svg>`
          : `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>`;

        el.innerHTML = `
          <div class="w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-white" style="background-color: ${bgColor}">
            ${icon}
          </div>
        `;
      }

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(stop.coords)
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(
            `<div class="p-2">
              <strong>${stop.name}</strong>
              ${
                stop.vehicleType
                  ? `<br/><span class="text-xs text-gray-500">${stop.vehicleType}</span>`
                  : ""
              }
            </div>`
          )
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
  }, [mapLoaded, tripPlan, getTrackSegment, routeLines]);

  // Handle route calculation from TripPlanner
  const handleRouteCalculated = useCallback((plan: TripPlan) => {
    setTripPlan(plan);
  }, []);

  // Handle clearing route
  const handleClearRoute = useCallback(() => {
    setTripPlan(null);
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

  // Clear external destination after it's consumed by TripPlanner
  const handleClearExternalDestination = useCallback(() => {
    setExternalDestination(null);
  }, []);

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

        {/* 3D Train Models - Only render when live trains or simulation is enabled */}
        {mapLoaded && use3DTrains && (showLiveTrains || showSimulation) && (
          <Train3DLayer
            map={mapInstance}
            // Pass real-time data only when live trains toggle is on
            redTrains={
              showLiveTrains && hasRealTimeData
                ? transformedRedTrains
                : undefined
            }
            blueTrains={
              showLiveTrains && hasRealTimeData
                ? transformedBlueTrains
                : undefined
            }
            // Pass simulation data only when simulation toggle is on
            redTrainPosition={showSimulation ? redTrain.trainPosition : null}
            blueTrainPosition={showSimulation ? blueTrain.trainPosition : null}
          />
        )}

        {/* Map Search - top center */}
        {mapLoaded && <MapSearch onGetDirections={handleGetDirections} />}

        {/* Station Search - top left */}
        {mapLoaded && (
          <StationSearch
            stations={stations}
            onStationSelect={onStationSelect}
          />
        )}

        {/* Trip Planner - top right, beside search */}
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

        {/* Train Following Controls - Only show when live trains or simulation is active */}
        {(showLiveTrains || showSimulation) && (
          <div className="absolute bottom-20 left-7 flex flex-col gap-2 rounded-2xl z-10">
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
              {followingTrain === "Blue"
                ? "STOP FOLLOWING"
                : "FOLLOW BLUE TRAIN"}
            </button>
          </div>
        )}

        {/* Train Speed Controls - Only show when simulation is active */}
        {showSimulation && (
          <TrainControls redTrain={redTrain} blueTrain={blueTrain} />
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

          {/* Simulation Toggle */}
          <button
            onClick={() => setShowSimulation(!showSimulation)}
            className={`p-3 backdrop-blur-sm border rounded-2xl transition-all ${
              showSimulation
                ? "bg-orange-600/90 border-orange-500 hover:bg-orange-500"
                : "bg-zinc-900/95 border-zinc-800 hover:bg-zinc-800"
            }`}
            aria-label={showSimulation ? "Stop simulation" : "Start simulation"}
            title={showSimulation ? "Stop simulation" : "Start simulation"}
          >
            <Play
              className={`w-5 h-5 ${
                showSimulation ? "text-white" : "text-zinc-300"
              }`}
            />
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

        {/* Train Status Indicator - Only show when live trains or simulation is active */}
        {mapLoaded && (showLiveTrains || showSimulation) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl backdrop-blur-sm border text-xs font-medium transition-all ${
                showLiveTrains && hasRealTimeData
                  ? "bg-green-900/80 border-green-700 text-green-200"
                  : showLiveTrains && isLoadingTrains
                  ? "bg-amber-900/80 border-amber-700 text-amber-200"
                  : showLiveTrains && isTrainError
                  ? "bg-red-900/80 border-red-700 text-red-200"
                  : showSimulation
                  ? "bg-orange-900/80 border-orange-700 text-orange-200"
                  : "bg-zinc-900/80 border-zinc-700 text-zinc-300"
              }`}
            >
              {showLiveTrains && hasRealTimeData ? (
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
              ) : showLiveTrains && isLoadingTrains ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Connecting to live data...</span>
                </>
              ) : showLiveTrains && isTrainError ? (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>Live data unavailable</span>
                </>
              ) : showSimulation ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                  </span>
                  <span>SIMULATION MODE</span>
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
