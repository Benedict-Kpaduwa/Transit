import type { LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  icon?: LucideIcon | null;
  isActive?: boolean;
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point" | "LineString";
    coordinates: [number, number] | [number, number][];
  };
  properties: {
    name?: string;
    stationnam?: string;
    leg?: string;
    direction?: string;
    route?: string;
    line?: string;
    type: "LRT_STATION" | "LRT_ROUTE" | "LRT_ROUTE_GENERATED";
    order?: number;
    station_count?: number;
    source?: string;
  };
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface Station {
  name: string;
  coords: [number, number];
  line: "Red" | "Blue";
  route: "201" | "202";
  shared?: boolean;
  leg?: string;
  direction?: string;
  stationnam?: string;
  order?: number;
}

export interface RouteLine {
  type: "LineString";
  coordinates: [number, number][];
  properties: {
    line: string;
    direction?: string;
    type: string;
    source?: string;
    station_count?: number;
  };
}

export type LineColor = "RED" | "BLUE";

export interface Train {
  id: string;
  line: LineColor;
  nextStation: string;
}

// Real-time C-Train position from API
export interface CTrainPosition {
  vehicle_id: string;
  route_id: string;
  line: "RED" | "BLUE";
  trip_id: string;
  position: {
    latitude: number;
    longitude: number;
    bearing?: number;
    speed?: number;
  };
  nearest_station?: string;
  distance_to_station?: number;
  timestamp: string;
}

export interface CTrainResponse {
  total: number;
  line: string;
  ctrains: CTrainPosition[];
}

export interface CTrainGeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    vehicle_id: string;
    route_id: string;
    line: "RED" | "BLUE";
    trip_id: string;
    nearest_station?: string;
    distance_to_station?: number;
    timestamp: string;
    type: "CTRAIN";
  };
}

export interface CTrainGeoJSONResponse {
  type: "FeatureCollection";
  features: CTrainGeoJSONFeature[];
  metadata: {
    count: number;
    line: string;
    timestamp: string;
  };
}
