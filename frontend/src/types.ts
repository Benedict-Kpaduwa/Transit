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
