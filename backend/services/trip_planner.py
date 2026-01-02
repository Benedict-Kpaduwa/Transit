"""
Trip Planning Service for Calgary Transit
Provides route planning functionality using GTFS data and Mapbox APIs
"""

import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
import pandas as pd
from config import settings

GTFS_DATA_DIR = Path("gtfs_data")

# Mapbox APIs
MAPBOX_GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places"
MAPBOX_DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox/walking"

# Calgary bounds for geocoding
CALGARY_BOUNDS = [-114.4, 50.8, -113.8, 51.3]  # [minLng, minLat, maxLng, maxLat]


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in meters"""
    R = 6371000  # Earth's radius in meters

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


async def geocode_address(
    query: str, proximity: Optional[Tuple[float, float]] = None
) -> List[Dict]:
    """
    Geocode an address using Mapbox Geocoding API
    Returns list of matching locations
    """
    if not settings.mapbox_access_token:
        raise ValueError("MAPBOX_ACCESS_TOKEN not configured")

    params = {
        "access_token": settings.mapbox_access_token,
        "country": "CA",
        "bbox": ",".join(map(str, CALGARY_BOUNDS)),
        "limit": 5,
        "types": "address,poi,place,locality,neighborhood",
    }

    if proximity:
        params["proximity"] = f"{proximity[0]},{proximity[1]}"

    url = f"{MAPBOX_GEOCODING_URL}/{query}.json"

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        results = []
        for feature in data.get("features", []):
            results.append(
                {
                    "name": feature.get("text", ""),
                    "place_name": feature.get("place_name", ""),
                    "coordinates": feature.get("center", []),  # [lng, lat]
                    "type": feature.get("place_type", [""])[0],
                }
            )

        return results


async def reverse_geocode(lng: float, lat: float) -> Optional[Dict]:
    """
    Reverse geocode coordinates to an address
    """
    if not settings.mapbox_access_token:
        raise ValueError("MAPBOX_ACCESS_TOKEN not configured")

    url = f"{MAPBOX_GEOCODING_URL}/{lng},{lat}.json"
    params = {
        "access_token": settings.mapbox_access_token,
        "types": "address,poi,place",
        "limit": 1,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        features = data.get("features", [])
        if features:
            return {
                "name": features[0].get("text", ""),
                "place_name": features[0].get("place_name", ""),
                "coordinates": [lng, lat],
            }
        return None


def load_stops_data() -> pd.DataFrame:
    """Load stops data from GTFS"""
    stops_path = GTFS_DATA_DIR / "stops.txt"
    if not stops_path.exists():
        raise FileNotFoundError("GTFS stops.txt not found")
    return pd.read_csv(stops_path)


def load_stop_times_data() -> pd.DataFrame:
    """Load stop times data from GTFS"""
    stop_times_path = GTFS_DATA_DIR / "stop_times.txt"
    if not stop_times_path.exists():
        raise FileNotFoundError("GTFS stop_times.txt not found")
    return pd.read_csv(stop_times_path)


def load_trips_data() -> pd.DataFrame:
    """Load trips data from GTFS"""
    trips_path = GTFS_DATA_DIR / "trips.txt"
    if not trips_path.exists():
        raise FileNotFoundError("GTFS trips.txt not found")
    return pd.read_csv(trips_path)


def load_routes_data() -> pd.DataFrame:
    """Load routes data from GTFS"""
    routes_path = GTFS_DATA_DIR / "routes.txt"
    if not routes_path.exists():
        raise FileNotFoundError("GTFS routes.txt not found")
    return pd.read_csv(routes_path)


def find_nearest_stops(
    lat: float,
    lon: float,
    stops_df: pd.DataFrame,
    limit: int = 5,
    max_distance: float = 2000,  # meters
    stop_type: Optional[str] = None,  # "LRT" or "BUS" or None for all
) -> List[Dict]:
    """
    Find the nearest transit stops to a given location
    """
    stops_with_distance = []

    for _, stop in stops_df.iterrows():
        stop_lat = stop["stop_lat"]
        stop_lon = stop["stop_lon"]
        distance = haversine_distance(lat, lon, stop_lat, stop_lon)

        if distance <= max_distance:
            stop_name = str(stop["stop_name"])
            stop_id = str(stop["stop_id"])

            # Determine if it's an LRT stop
            is_lrt = "Station" in stop_name or "CTrain" in stop_name

            if stop_type == "LRT" and not is_lrt:
                continue
            if stop_type == "BUS" and is_lrt:
                continue

            stops_with_distance.append(
                {
                    "stop_id": stop_id,
                    "stop_name": stop_name,
                    "stop_lat": stop_lat,
                    "stop_lon": stop_lon,
                    "distance": round(distance),
                    "is_lrt": is_lrt,
                }
            )

    # Sort by distance and return top results
    stops_with_distance.sort(key=lambda x: x["distance"])
    return stops_with_distance[:limit]


async def get_walking_directions(
    origin: Tuple[float, float],  # [lng, lat]
    destination: Tuple[float, float],  # [lng, lat]
) -> Optional[Dict]:
    """
    Get walking directions between two points using Mapbox Directions API
    """
    if not settings.mapbox_access_token:
        return None

    coords = f"{origin[0]},{origin[1]};{destination[0]},{destination[1]}"
    url = f"{MAPBOX_DIRECTIONS_URL}/{coords}"

    params = {
        "access_token": settings.mapbox_access_token,
        "geometries": "geojson",
        "overview": "full",
        "steps": "true",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        routes = data.get("routes", [])
        if routes:
            route = routes[0]
            return {
                "distance": route.get("distance", 0),  # meters
                "duration": route.get("duration", 0),  # seconds
                "geometry": route.get("geometry", {}),
                "steps": [
                    {
                        "instruction": step.get("maneuver", {}).get("instruction", ""),
                        "distance": step.get("distance", 0),
                        "duration": step.get("duration", 0),
                    }
                    for leg in route.get("legs", [])
                    for step in leg.get("steps", [])
                ],
            }
        return None


def find_transit_route(
    origin_stop: Dict,
    destination_stop: Dict,
    trips_df: pd.DataFrame,
    stop_times_df: pd.DataFrame,
    routes_df: pd.DataFrame,
) -> Optional[Dict]:
    """
    Find a transit route between two stops
    Returns route information including which line to take
    """
    origin_stop_id = origin_stop["stop_id"]
    dest_stop_id = destination_stop["stop_id"]

    # Find trips that serve both stops
    origin_trips = set(
        stop_times_df[stop_times_df["stop_id"].astype(str) == origin_stop_id][
            "trip_id"
        ].astype(str)
    )
    dest_trips = set(
        stop_times_df[stop_times_df["stop_id"].astype(str) == dest_stop_id][
            "trip_id"
        ].astype(str)
    )

    common_trips = origin_trips.intersection(dest_trips)

    if not common_trips:
        return None

    # Get a sample trip to determine route info
    sample_trip_id = list(common_trips)[0]
    trip_info = trips_df[trips_df["trip_id"].astype(str) == sample_trip_id].iloc[0]
    route_id = str(trip_info["route_id"])

    # Get route details
    route_info = routes_df[routes_df["route_id"].astype(str) == route_id]
    if route_info.empty:
        return None

    route_row = route_info.iloc[0]
    route_short_name = (
        str(route_row["route_short_name"])
        if pd.notna(route_row["route_short_name"])
        else route_id
    )
    route_long_name = (
        str(route_row["route_long_name"])
        if pd.notna(route_row["route_long_name"])
        else ""
    )
    route_type = int(route_row["route_type"])

    # Determine vehicle type and line
    if route_type == 0:  # Light Rail
        vehicle_type = "CTrain"
        line = "Red Line" if route_id == "201" else "Blue Line"
        color = "#DC143C" if route_id == "201" else "#0088FF"
    else:  # Bus
        vehicle_type = "Bus"
        line = f"Route {route_short_name}"
        color = "#22c55e"

    # Get stop sequence for this trip
    trip_stop_times = stop_times_df[
        stop_times_df["trip_id"].astype(str) == sample_trip_id
    ].sort_values("stop_sequence")

    origin_seq = trip_stop_times[
        trip_stop_times["stop_id"].astype(str) == origin_stop_id
    ]["stop_sequence"].values
    dest_seq = trip_stop_times[trip_stop_times["stop_id"].astype(str) == dest_stop_id][
        "stop_sequence"
    ].values

    if len(origin_seq) == 0 or len(dest_seq) == 0:
        return None

    # Count stops between origin and destination
    num_stops = abs(int(dest_seq[0]) - int(origin_seq[0]))

    return {
        "route_id": route_id,
        "route_short_name": route_short_name,
        "route_long_name": route_long_name,
        "vehicle_type": vehicle_type,
        "line": line,
        "color": color,
        "num_stops": num_stops,
        "direction": "forward" if dest_seq[0] > origin_seq[0] else "backward",
    }


async def plan_trip(
    origin_coords: Tuple[float, float],  # [lng, lat]
    destination_coords: Tuple[float, float],  # [lng, lat]
    prefer_lrt: bool = True,
) -> Dict:
    """
    Plan a trip from origin to destination using Calgary Transit
    Returns comprehensive trip plan including walking and transit segments
    """
    # Load GTFS data
    stops_df = load_stops_data()
    trips_df = load_trips_data()
    stop_times_df = load_stop_times_data()
    routes_df = load_routes_data()

    origin_lng, origin_lat = origin_coords
    dest_lng, dest_lat = destination_coords

    # Find nearest stops to origin and destination
    # Prefer LRT if requested
    stop_type = "LRT" if prefer_lrt else None

    origin_stops = find_nearest_stops(
        origin_lat, origin_lng, stops_df, limit=5, stop_type=stop_type
    )

    # If no LRT stops found, try all stops
    if not origin_stops and prefer_lrt:
        origin_stops = find_nearest_stops(origin_lat, origin_lng, stops_df, limit=5)

    dest_stops = find_nearest_stops(
        dest_lat, dest_lng, stops_df, limit=5, stop_type=stop_type
    )

    if not dest_stops and prefer_lrt:
        dest_stops = find_nearest_stops(dest_lat, dest_lng, stops_df, limit=5)

    if not origin_stops or not dest_stops:
        return {
            "success": False,
            "error": "No transit stops found near origin or destination",
            "origin_stops": origin_stops,
            "destination_stops": dest_stops,
        }

    # Try to find a route between the nearest stops
    best_route = None
    best_origin_stop = None
    best_dest_stop = None

    for origin_stop in origin_stops:
        for dest_stop in dest_stops:
            route = find_transit_route(
                origin_stop, dest_stop, trips_df, stop_times_df, routes_df
            )
            if route:
                # Prefer shorter total walking distance
                total_walk = origin_stop["distance"] + dest_stop["distance"]
                if best_route is None or total_walk < (
                    best_origin_stop["distance"] + best_dest_stop["distance"]
                ):
                    best_route = route
                    best_origin_stop = origin_stop
                    best_dest_stop = dest_stop

    if not best_route:
        return {
            "success": False,
            "error": "No direct transit route found between locations",
            "suggestion": "Try different stops or consider a transfer",
            "origin_stops": origin_stops,
            "destination_stops": dest_stops,
        }

    # Get walking directions to origin stop
    walk_to_stop = await get_walking_directions(
        origin_coords, (best_origin_stop["stop_lon"], best_origin_stop["stop_lat"])
    )

    # Get walking directions from destination stop
    walk_from_stop = await get_walking_directions(
        (best_dest_stop["stop_lon"], best_dest_stop["stop_lat"]), destination_coords
    )

    # Build the trip plan
    segments = []
    total_duration = 0
    total_distance = 0

    # Segment 1: Walk to transit stop
    if walk_to_stop:
        segments.append(
            {
                "type": "walk",
                "instruction": f"Walk to {best_origin_stop['stop_name']}",
                "distance": walk_to_stop["distance"],
                "duration": walk_to_stop["duration"],
                "geometry": walk_to_stop["geometry"],
                "steps": walk_to_stop.get("steps", []),
                "from": {"name": "Starting point", "coordinates": list(origin_coords)},
                "to": {
                    "name": best_origin_stop["stop_name"],
                    "coordinates": [
                        best_origin_stop["stop_lon"],
                        best_origin_stop["stop_lat"],
                    ],
                },
            }
        )
        total_duration += walk_to_stop["duration"]
        total_distance += walk_to_stop["distance"]

    # Segment 2: Take transit
    # Estimate transit time (rough: 2 min per stop for LRT, 3 min for bus)
    transit_time_per_stop = 120 if best_route["vehicle_type"] == "CTrain" else 180
    transit_duration = best_route["num_stops"] * transit_time_per_stop

    segments.append(
        {
            "type": "transit",
            "instruction": f"Take {best_route['line']} ({best_route['vehicle_type']})",
            "line": best_route["line"],
            "vehicle_type": best_route["vehicle_type"],
            "color": best_route["color"],
            "route_id": best_route["route_id"],
            "num_stops": best_route["num_stops"],
            "duration": transit_duration,
            "from": {
                "name": best_origin_stop["stop_name"],
                "coordinates": [
                    best_origin_stop["stop_lon"],
                    best_origin_stop["stop_lat"],
                ],
            },
            "to": {
                "name": best_dest_stop["stop_name"],
                "coordinates": [best_dest_stop["stop_lon"], best_dest_stop["stop_lat"]],
            },
        }
    )
    total_duration += transit_duration

    # Segment 3: Walk from transit stop to destination
    if walk_from_stop:
        segments.append(
            {
                "type": "walk",
                "instruction": f"Walk to your destination",
                "distance": walk_from_stop["distance"],
                "duration": walk_from_stop["duration"],
                "geometry": walk_from_stop["geometry"],
                "steps": walk_from_stop.get("steps", []),
                "from": {
                    "name": best_dest_stop["stop_name"],
                    "coordinates": [
                        best_dest_stop["stop_lon"],
                        best_dest_stop["stop_lat"],
                    ],
                },
                "to": {"name": "Destination", "coordinates": list(destination_coords)},
            }
        )
        total_duration += walk_from_stop["duration"]
        total_distance += walk_from_stop["distance"]

    return {
        "success": True,
        "summary": {
            "total_duration": total_duration,
            "total_duration_text": format_duration(total_duration),
            "total_walking_distance": total_distance,
            "total_walking_distance_text": format_distance(total_distance),
            "transit_line": best_route["line"],
            "transit_type": best_route["vehicle_type"],
        },
        "origin": {
            "coordinates": list(origin_coords),
        },
        "destination": {
            "coordinates": list(destination_coords),
        },
        "segments": segments,
    }


def format_duration(seconds: float) -> str:
    """Format duration in seconds to human readable string"""
    minutes = int(seconds / 60)
    if minutes < 60:
        return f"{minutes} min"
    hours = minutes // 60
    remaining_mins = minutes % 60
    if remaining_mins == 0:
        return f"{hours} hr"
    return f"{hours} hr {remaining_mins} min"


def format_distance(meters: float) -> str:
    """Format distance in meters to human readable string"""
    if meters < 1000:
        return f"{int(meters)} m"
    km = meters / 1000
    return f"{km:.1f} km"
