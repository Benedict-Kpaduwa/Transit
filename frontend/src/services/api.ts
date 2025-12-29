import type { GeoJSONFeatureCollection, RouteLine, Station } from "@/types";
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
      let url = "/lrt/routes/generated";
      if (line) {
        const lineParam = line === "Red" ? "RED" : "BLUE";
        url = `/lrt/routes/generated?line=${lineParam}`;
      }

      const response = await api.get<GeoJSONFeatureCollection>(url);
      return transformRouteLines(response.data);
    } catch (error) {
      console.error("Error fetching route lines:", error);
      throw error;
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
