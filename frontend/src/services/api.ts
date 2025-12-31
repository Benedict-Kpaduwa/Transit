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
    };
  }>;
}

export const busStopApi = {
  /**
   * Get all bus stops as GeoJSON
   */
  getAllStops: async (): Promise<BusStop[]> => {
    try {
      const response = await api.get<BusStopGeoJSON>("/stops");
      return response.data.features
        .filter((f) => f.geometry.type === "Point")
        .map((feature) => ({
          id: feature.properties.stop_id || "",
          name: feature.properties.stop_name || "Unknown Stop",
          code: feature.properties.stop_code || "",
          coords: feature.geometry.coordinates,
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
