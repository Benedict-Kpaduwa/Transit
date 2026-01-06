import type {
  GeoJSONFeatureCollection,
  RouteLine,
  Station,
  CTrainPosition,
  CTrainResponse,
} from "@/types";
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  // timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const stationApi = {
  getAllStations: async (): Promise<Station[]> => {
    try {
      const response = await api.get<GeoJSONFeatureCollection>("/lrt/stations");
      return transformStations(response.data);
    } catch (error) {
      console.error("Error fetching stations:", error);
      throw error;
    }
  },

  getSortedStations: async (line?: "Red" | "Blue"): Promise<Station[]> => {
    try {
      let url = "/lrt/stations/sorted";
      if (line) {
        const lineParam = line === "Red" ? "RED" : "BLUE";
        url = `/lrt/stations/sorted/${lineParam}`;
      }

      const response = await api.get<GeoJSONFeatureCollection>(url);
      return transformStations(response.data);
    } catch (error) {
      console.error("Error fetching sorted stations:", error);
      throw error;
    }
  },

  getRouteLines: async (line?: "Red" | "Blue"): Promise<RouteLine[]> => {
    try {
      // Use /lrt/tracks for actual track geometry from GTFS shapes
      let url = "/lrt/tracks";
      if (line) {
        const lineParam = line === "Red" ? "RED" : "BLUE";
        url = `/lrt/tracks?line=${lineParam}`;
      }

      const response = await api.get<GeoJSONFeatureCollection>(url);
      return transformRouteLines(response.data);
    } catch (error) {
      console.error("Error fetching route lines:", error);
      // Fallback to generated routes if tracks fail
      try {
        let fallbackUrl = "/lrt/routes/generated";
        if (line) {
          const lineParam = line === "Red" ? "RED" : "BLUE";
          fallbackUrl = `/lrt/routes/generated?line=${lineParam}`;
        }
        const fallbackResponse = await api.get<GeoJSONFeatureCollection>(fallbackUrl);
        return transformRouteLines(fallbackResponse.data);
      } catch (fallbackError) {
        console.error("Fallback also failed:", fallbackError);
        throw error;
      }
    }
  },

  getAllStationsByLineSorted: async (): Promise<{
    red: Station[];
    blue: Station[];
  }> => {
    try {
      const [redStations, blueStations] = await Promise.all([
        stationApi.getSortedStations("Red"),
        stationApi.getSortedStations("Blue"),
      ]);

      return { red: redStations, blue: blueStations };
    } catch (error) {
      console.error("Error fetching sorted stations by line:", error);
      const allStations = await stationApi.getAllStations();
      return {
        red: allStations.filter((s) => s.line === "Red"),
        blue: allStations.filter((s) => s.line === "Blue"),
      };
    }
  },

  getAllRouteLines: async (): Promise<{
    red: RouteLine[];
    blue: RouteLine[];
  }> => {
    try {
      const [redLines, blueLines] = await Promise.all([
        stationApi.getRouteLines("Red"),
        stationApi.getRouteLines("Blue"),
      ]);

      return { red: redLines, blue: blueLines };
    } catch (error) {
      console.error("Error fetching route lines:", error);
      return { red: [], blue: [] };
    }
  },

  testConnection: async (): Promise<boolean> => {
    try {
      await api.get("/health");
      return true;
    } catch (error) {
      console.error("Backend connection failed:", error);
      return false;
    }
  },
};

// C-Train real-time position API
export const ctrainApi = {
  /**
   * Get all real-time C-Train positions
   * @param line - Optional filter: "RED" or "BLUE"
   */
  getPositions: async (line?: "RED" | "BLUE"): Promise<CTrainPosition[]> => {
    try {
      const params = line ? { line } : {};
      const response = await api.get<CTrainResponse>("/ctrains", { params });
      return response.data.ctrains;
    } catch (error) {
      console.error("Error fetching C-Train positions:", error);
      throw error;
    }
  },

  /**
   * Get C-Train positions by line
   */
  getRedLinePositions: async (): Promise<CTrainPosition[]> => {
    return ctrainApi.getPositions("RED");
  },

  getBlueLinePositions: async (): Promise<CTrainPosition[]> => {
    return ctrainApi.getPositions("BLUE");
  },

  /**
   * Get all C-Train positions grouped by line
   */
  getAllPositionsByLine: async (): Promise<{
    red: CTrainPosition[];
    blue: CTrainPosition[];
    all: CTrainPosition[];
  }> => {
    try {
      const allTrains = await ctrainApi.getPositions();
      return {
        red: allTrains.filter((t) => t.line === "RED"),
        blue: allTrains.filter((t) => t.line === "BLUE"),
        all: allTrains,
      };
    } catch (error) {
      console.error("Error fetching C-Train positions by line:", error);
      return { red: [], blue: [], all: [] };
    }
  },
};

// Bus stops API
export interface BusStop {
  id: string;
  name: string;
  code: string;
  coords: [number, number];
  routes?: string[];
  routeNames?: string[];
}

// Response type for bus stops GeoJSON
interface BusStopGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
    properties: {
      stop_id?: string;
      stop_name?: string;
      stop_code?: string;
      routes?: string[];
      route_names?: string[];
    };
  }>;
}

export const busStopApi = {
  /**
   * Get all bus stops as GeoJSON with route information
   */
  getAllStops: async (): Promise<BusStop[]> => {
    try {
      const response = await api.get<BusStopGeoJSON>("/stops?with_routes=true");
      return response.data.features
        .filter((f) => f.geometry.type === "Point")
        .map((feature) => ({
          id: feature.properties.stop_id || "",
          name: feature.properties.stop_name || "Unknown Stop",
          code: feature.properties.stop_code || "",
          coords: feature.geometry.coordinates,
          routes: feature.properties.routes || [],
          routeNames: feature.properties.route_names || [],
        }));
    } catch (error) {
      console.error("Error fetching bus stops:", error);
      return [];
    }
  },
};

function transformStations(geojson: GeoJSONFeatureCollection): Station[] {
  return geojson.features
    .filter((feature) => feature.geometry.type === "Point")
    .map((feature) => {
      const properties = feature.properties;
      const coords = feature.geometry.coordinates as [number, number];

      const line = properties.line?.includes("RED")
        ? ("Red" as const)
        : ("Blue" as const);

      const isShared = properties.route === "201/202";

      return {
        name: properties.name || properties.stationnam || "Unknown Station",
        stationnam: properties.stationnam,
        coords: coords,
        line: line,
        route: properties.route as "201" | "202",
        shared: isShared,
        leg: properties.leg,
        direction: properties.direction,
        order: properties.order,
      };
    });
}

function transformRouteLines(geojson: GeoJSONFeatureCollection): RouteLine[] {
  return geojson.features
    .filter((feature) => feature.geometry.type === "LineString")
    .map((feature) => ({
      type: "LineString" as const,
      coordinates: feature.geometry.coordinates as [number, number][],
      properties: {
        line: feature.properties.line || "UNKNOWN",
        direction: feature.properties.direction,
        type: feature.properties.type || "LRT_ROUTE",
        source: feature.properties.source,
        station_count: feature.properties.station_count,
      },
    }));
}

// ============================================
// Trip Planning API
// ============================================

export interface GeocodingResult {
  name: string;
  place_name: string;
  coordinates: [number, number]; // [lng, lat]
  type: string;
}

export interface NearbyStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  distance: number;
  is_lrt: boolean;
}

export interface TripSegment {
  type: "walk" | "transit";
  instruction: string;
  distance?: number;
  duration: number;
  geometry?: {
    type: string;
    coordinates: [number, number][];
  };
  steps?: Array<{
    instruction: string;
    distance: number;
    duration: number;
  }>;
  line?: string;
  vehicle_type?: string;
  color?: string;
  route_id?: string;
  num_stops?: number;
  from: {
    name: string;
    coordinates: [number, number];
  };
  to: {
    name: string;
    coordinates: [number, number];
  };
}

export interface TripPlan {
  success: boolean;
  error?: string;
  suggestion?: string;
  summary?: {
    total_duration: number;
    total_duration_text: string;
    total_walking_distance: number;
    total_walking_distance_text: string;
    transit_line: string;
    transit_type: string;
  };
  origin?: {
    coordinates: [number, number];
  };
  destination?: {
    coordinates: [number, number];
  };
  segments?: TripSegment[];
  origin_stops?: NearbyStop[];
  destination_stops?: NearbyStop[];
}

export const tripPlannerApi = {
  /**
   * Geocode an address or place name
   */
  geocode: async (
    query: string,
    proximity?: { lng: number; lat: number }
  ): Promise<GeocodingResult[]> => {
    try {
      const params: Record<string, string | number> = { q: query };
      if (proximity) {
        params.proximity_lng = proximity.lng;
        params.proximity_lat = proximity.lat;
      }
      const response = await api.get<{ query: string; results: GeocodingResult[] }>(
        "/geocode",
        { params }
      );
      return response.data.results;
    } catch (error) {
      console.error("Geocoding error:", error);
      return [];
    }
  },

  /**
   * Find nearby transit stops
   */
  findNearbyStops: async (
    lat: number,
    lng: number,
    options?: {
      limit?: number;
      maxDistance?: number;
      stopType?: "LRT" | "BUS";
    }
  ): Promise<NearbyStop[]> => {
    try {
      const params: Record<string, string | number> = { lat, lng };
      if (options?.limit) params.limit = options.limit;
      if (options?.maxDistance) params.max_distance = options.maxDistance;
      if (options?.stopType) params.stop_type = options.stopType;

      const response = await api.get<{ location: { lat: number; lng: number }; stops: NearbyStop[] }>(
        "/nearby-stops",
        { params }
      );
      return response.data.stops;
    } catch (error) {
      console.error("Error finding nearby stops:", error);
      return [];
    }
  },

  /**
   * Plan a trip between two locations
   */
  planTrip: async (
    origin: { lng: number; lat: number },
    destination: { lng: number; lat: number },
    preferLrt: boolean = true
  ): Promise<TripPlan> => {
    try {
      const params = {
        origin_lng: origin.lng,
        origin_lat: origin.lat,
        dest_lng: destination.lng,
        dest_lat: destination.lat,
        prefer_lrt: preferLrt,
      };

      const response = await api.get<TripPlan>("/trip/plan", { params });
      return response.data;
    } catch (error) {
      console.error("Trip planning error:", error);
      return {
        success: false,
        error: "Failed to plan trip. Please try again.",
      };
    }
  },
};

// ============================================
// Real-Time Arrivals API (Transit App Style)
// ============================================

export interface Arrival {
  trip_id: string;
  route_id: string;
  route_short_name: string;
  vehicle_type: "CTrain" | "Bus";
  line: string | null;
  color: string;
  headsign: string;
  vehicle_id: string | null;
  stop_id: string;
  stop_name: string | null;
  arrival_time: string;
  arrival_timestamp: number;
  delay_seconds: number;
  delay_minutes: number;
  minutes_away: number;
  status: string;
}

export interface RouteServing {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  vehicle_type: "CTrain" | "Bus";
  line: string | null;
  color: string;
}

export interface StopArrivalsResponse {
  stop: {
    stop_id: string;
    stop_code: string;
    stop_name: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  routes_serving: RouteServing[];
  arrivals: Arrival[];
  total_arrivals: number;
  timestamp: string;
}

export interface NearbyStopWithArrivals {
  stop: {
    stop_id: string;
    stop_code: string;
    stop_name: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
    distance_meters: number;
  };
  routes: Array<{
    route_short_name: string;
    vehicle_type: string;
    color: string;
  }>;
  arrivals: Arrival[];
}

export interface NearbyArrivalsResponse {
  location: {
    latitude: number;
    longitude: number;
  };
  radius_meters: number;
  stops: NearbyStopWithArrivals[];
  total_stops_found: number;
  timestamp: string;
}

export interface StationArrivalsResponse {
  station: {
    name: string;
    stops: Array<{
      stop_id: string;
      stop_name: string;
    }>;
  };
  line_filter: string | null;
  arrivals: Arrival[];
  total_arrivals: number;
  timestamp: string;
}

export const arrivalsApi = {
  /**
   * Get real-time arrivals for a specific stop
   * This is the "when is my bus/train coming?" endpoint
   */
  getStopArrivals: async (
    stopId: string,
    options?: {
      limit?: number;
      route?: string;
      vehicleType?: "CTrain" | "Bus";
    }
  ): Promise<StopArrivalsResponse> => {
    try {
      const params: Record<string, string | number> = {};
      if (options?.limit) params.limit = options.limit;
      if (options?.route) params.route = options.route;
      if (options?.vehicleType) params.vehicle_type = options.vehicleType;

      const response = await api.get<StopArrivalsResponse>(
        `/arrivals/${stopId}`,
        { params }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching stop arrivals:", error);
      throw error;
    }
  },

  /**
   * Get nearby stops with their arrivals
   * Like the Transit app home screen
   */
  getNearbyArrivals: async (
    lat: number,
    lng: number,
    options?: {
      radius?: number;
      limitStops?: number;
      limitArrivals?: number;
      vehicleType?: "CTrain" | "Bus";
    }
  ): Promise<NearbyArrivalsResponse> => {
    try {
      const params: Record<string, string | number> = { lat, lng };
      if (options?.radius) params.radius = options.radius;
      if (options?.limitStops) params.limit_stops = options.limitStops;
      if (options?.limitArrivals) params.limit_arrivals = options.limitArrivals;
      if (options?.vehicleType) params.vehicle_type = options.vehicleType;

      const response = await api.get<NearbyArrivalsResponse>(
        "/arrivals/nearby",
        { params }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching nearby arrivals:", error);
      throw error;
    }
  },

  /**
   * Get arrivals for a CTrain station by name
   */
  getStationArrivals: async (
    stationName: string,
    line?: "Red" | "Blue",
    limit?: number
  ): Promise<StationArrivalsResponse> => {
    try {
      const params: Record<string, string | number> = {};
      if (line) params.line = line;
      if (limit) params.limit = limit;

      const response = await api.get<StationArrivalsResponse>(
        `/arrivals/station/${encodeURIComponent(stationName)}`,
        { params }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching station arrivals:", error);
      throw error;
    }
  },
};

// ============================================
// Vehicle Tracking API
// ============================================

export interface Vehicle {
  vehicle_id: string;
  trip_id: string;
  route_id: string;
  route_short_name: string;
  vehicle_type: "CTrain" | "Bus";
  line: string | null;
  color: string;
  headsign: string;
  position: {
    latitude: number;
    longitude: number;
    bearing: number | null;
    speed: number | null;
  };
  current_stop_sequence: number | null;
  stop_id: string | null;
  current_status: number | null;
  timestamp: number;
}

export interface VehiclesResponse {
  count: number;
  line_filter?: string | null;
  route_filter?: string | null;
  vehicles: Vehicle[];
  timestamp: string;
}

export const vehiclesApi = {
  /**
   * Get real-time CTrain positions
   */
  getCTrains: async (line?: "Red" | "Blue"): Promise<VehiclesResponse> => {
    try {
      const params: Record<string, string> = {};
      if (line) params.line = line;

      const response = await api.get<VehiclesResponse>("/vehicles/ctrains", { params });
      return response.data;
    } catch (error) {
      console.error("Error fetching CTrain positions:", error);
      throw error;
    }
  },

  /**
   * Get real-time bus positions
   */
  getBuses: async (route?: string): Promise<VehiclesResponse> => {
    try {
      const params: Record<string, string> = {};
      if (route) params.route = route;

      const response = await api.get<VehiclesResponse>("/vehicles/buses", { params });
      return response.data;
    } catch (error) {
      console.error("Error fetching bus positions:", error);
      throw error;
    }
  },

  /**
   * Get all vehicles
   */
  getAllVehicles: async (vehicleType?: "CTrain" | "Bus"): Promise<VehiclesResponse> => {
    try {
      const params: Record<string, string> = {};
      if (vehicleType) params.vehicle_type = vehicleType;

      const response = await api.get<VehiclesResponse>("/vehicles", { params });
      return response.data;
    } catch (error) {
      console.error("Error fetching vehicles:", error);
      throw error;
    }
  },
};
