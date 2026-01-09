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

// Real-time C-Train position from API (may be GPS or interpolated)
export interface CTrainPosition {
  vehicle_id: string;
  route_id: string;
  route_short_name?: string;
  vehicle_type: "CTrain";
  line: "RED" | "BLUE" | "Red" | "Blue";
  color?: string;
  trip_id: string;
  headsign?: string;
  position: {
    latitude: number;
    longitude: number;
    bearing?: number | null;
    speed?: number | null;
  };
  prev_stop?: string;
  next_stop?: string;
  progress?: number;
  interpolated?: boolean;
  nearest_station?: string;
  distance_to_station?: number;
  timestamp: number | string;
}

export interface CTrainResponse {
  count: number;
  line_filter: string | null;
  data_source: "gps" | "interpolated" | null;
  vehicles: CTrainPosition[];
  timestamp: string;
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
