"""
Trip Planning Service for Calgary Transit
Provides route planning functionality using GTFS data and Mapbox APIs
"""

import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple

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


def get_all_lrt_stations(stops_df: pd.DataFrame) -> List[Dict]:
    """
    Get all CTrain/LRT stations from GTFS data - optimized with vectorized filtering
    """
    # Use vectorized string operations instead of iterating
    mask = stops_df["stop_name"].str.contains("Station|CTrain", case=False, na=False)
    lrt_stops = stops_df[mask]

    stations = []
    for _, stop in lrt_stops.iterrows():
        stations.append(
            {
                "stop_id": str(stop["stop_id"]),
                "stop_name": str(stop["stop_name"]),
                "stop_lat": stop["stop_lat"],
                "stop_lon": stop["stop_lon"],
                "is_lrt": True,
            }
        )
    return stations


# Cache for pre-computed lookups to avoid repeated DataFrame operations
_stop_trips_cache: Dict[str, set] = {}
_trip_routes_cache: Dict[str, str] = {}


def precompute_lookups(
    stop_times_df: pd.DataFrame, trips_df: pd.DataFrame
) -> Tuple[Dict[str, set], Dict[str, str]]:
    """
    Pre-compute stop->trips and trip->route mappings for faster lookups
    """
    global _stop_trips_cache, _trip_routes_cache

    if not _stop_trips_cache:
        # Build stop_id -> set of trip_ids
        stop_trips = stop_times_df.groupby("stop_id")["trip_id"].apply(set).to_dict()
        _stop_trips_cache = {str(k): {str(t) for t in v} for k, v in stop_trips.items()}

    if not _trip_routes_cache:
        # Build trip_id -> route_id
        _trip_routes_cache = dict(
            zip(trips_df["trip_id"].astype(str), trips_df["route_id"].astype(str))
        )

    return _stop_trips_cache, _trip_routes_cache


def find_transit_route_fast(
    origin_stop_id: str,
    dest_stop_id: str,
    stop_trips: Dict[str, set],
    trip_routes: Dict[str, str],
    routes_df: pd.DataFrame,
    _stops_df: pd.DataFrame,  # Unused but kept for API consistency
    _stop_times_df: pd.DataFrame,  # Unused but kept for API consistency
    origin_stop: Dict,
    dest_stop: Dict,
) -> Optional[Dict]:
    """
    Fast version of find_transit_route using pre-computed lookups
    """
    # Get trips serving each stop
    origin_trips = stop_trips.get(origin_stop_id, set())
    dest_trips = stop_trips.get(dest_stop_id, set())

    common_trips = origin_trips.intersection(dest_trips)
    if not common_trips:
        return None

    # Get route info for first common trip
    sample_trip_id = next(iter(common_trips))
    route_id = trip_routes.get(sample_trip_id)
    if not route_id:
        return None

    # Get route details (cached lookup)
    route_info = routes_df[routes_df["route_id"].astype(str) == route_id]
    if route_info.empty:
        return None

    route_row = route_info.iloc[0]
    route_type = int(route_row["route_type"])
    route_short_name = (
        str(route_row["route_short_name"])
        if pd.notna(route_row["route_short_name"])
        else route_id
    )

    # Determine vehicle type
    if route_type == 0:  # Light Rail
        vehicle_type = "CTrain"

        # Red Line unique stations (Tuscany to Somerset-Bridlewood)
        red_line_stations = [
            "tuscany",
            "crowfoot",
            "dalhousie",
            "brentwood",
            "university",
            "lions park",
            "sait",
            "banff trail",
            "sunnyside",
            # South of downtown (Red Line only)
            "39 ave",
            "39 avenue",
            "chinook",
            "heritage",
            "southland",
            "anderson",
            "canyon meadows",
            "fish creek",
            "shawnessy",
            "somerset",
            "bridlewood",
        ]

        # Blue Line unique stations (69 Street to Saddletowne)
        blue_line_stations = [
            "69 street",
            "sirocco",
            "westbrook",
            "shaganappi point",
            "sunalta",
            # East of downtown (Blue Line only)
            "erlton",
            "victoria park",
            "stampede",
            "rundle",
            "whitehorn",
            "mcknight",
            "martindale",
            "saddletowne",
            "franklin",
        ]

        # Check both origin and destination names to determine line
        origin_name = origin_stop.get("stop_name", "").lower()
        dest_name = dest_stop.get("stop_name", "").lower()

        is_red = any(s in origin_name or s in dest_name for s in red_line_stations)
        is_blue = any(s in origin_name or s in dest_name for s in blue_line_stations)

        # Determine line based on stations
        if is_red and not is_blue:
            line = "Red Line"
            color = "#DC143C"
        elif is_blue and not is_red:
            line = "Blue Line"
            color = "#0088FF"
        else:
            # Fallback to route_id if both or neither match
            line = "Red Line" if route_id == "201" else "Blue Line"
            color = "#DC143C" if route_id == "201" else "#0088FF"
    else:
        vehicle_type = "Bus"
        line = f"Route {route_short_name}"
        color = "#22c55e"

    # Estimate stops (simplified - use distance as proxy)
    dist = haversine_distance(
        origin_stop["stop_lat"],
        origin_stop["stop_lon"],
        dest_stop["stop_lat"],
        dest_stop["stop_lon"],
    )
    # Rough estimate: 1 stop per 500m for CTrain, 300m for bus
    stop_spacing = 500 if vehicle_type == "CTrain" else 300
    num_stops = max(1, int(dist / stop_spacing))

    return {
        "route_id": route_id,
        "route_short_name": route_short_name,
        "vehicle_type": vehicle_type,
        "line": line,
        "color": color,
        "num_stops": num_stops,
    }


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


async def get_driving_directions(
    origin: Tuple[float, float],  # [lng, lat]
    destination: Tuple[float, float],  # [lng, lat]
) -> Optional[Dict]:
    """
    Get driving directions between two points using Mapbox Directions API
    Used for bus routes to follow actual roads
    """
    if not settings.mapbox_access_token:
        return None

    coords = f"{origin[0]},{origin[1]};{destination[0]},{destination[1]}"
    # Use driving profile which follows roads (similar to how buses travel)
    url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{coords}"

    params = {
        "access_token": settings.mapbox_access_token,
        "geometries": "geojson",
        "overview": "full",
    }

    try:
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
                }
            return None
    except Exception:
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

        # Red Line unique stations (Tuscany to Somerset-Bridlewood)
        red_stations = [
            "tuscany",
            "crowfoot",
            "dalhousie",
            "brentwood",
            "university",
            "lions park",
            "sait",
            "banff trail",
            "sunnyside",
            # South of downtown (Red Line only)
            "39 ave",
            "39 avenue",
            "chinook",
            "heritage",
            "southland",
            "anderson",
            "canyon meadows",
            "fish creek",
            "shawnessy",
            "somerset",
            "bridlewood",
        ]

        # Blue Line unique stations (69 Street to Saddletowne)
        blue_stations = [
            "69 street",
            "sirocco",
            "westbrook",
            "shaganappi point",
            "sunalta",
            # East of downtown (Blue Line only)
            "erlton",
            "victoria park",
            "stampede",
            "rundle",
            "whitehorn",
            "mcknight",
            "martindale",
            "saddletowne",
            "franklin",
        ]

        # Check both origin and destination names
        origin_name = origin_stop.get("stop_name", "").lower()
        dest_name = destination_stop.get("stop_name", "").lower()

        is_red = any(s in origin_name or s in dest_name for s in red_stations)
        is_blue = any(s in origin_name or s in dest_name for s in blue_stations)

        # Determine line based on stations
        if is_red and not is_blue:
            line = "Red Line"
            color = "#DC143C"
        elif is_blue and not is_red:
            line = "Blue Line"
            color = "#0088FF"
        else:
            # Fallback to route_id if both or neither match
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
    Supports single-leg and multi-leg (transfer) trips
    Returns comprehensive trip plan including walking and transit segments
    """
    # Load GTFS data
    stops_df = load_stops_data()
    trips_df = load_trips_data()
    stop_times_df = load_stop_times_data()
    routes_df = load_routes_data()

    origin_lng, origin_lat = origin_coords
    dest_lng, dest_lat = destination_coords

    # ===== STRATEGY 1: Try direct route (single transit leg) =====
    direct_result = await try_direct_route(
        origin_coords,
        destination_coords,
        stops_df,
        trips_df,
        stop_times_df,
        routes_df,
        prefer_lrt,
    )

    if direct_result and direct_result.get("success"):
        return direct_result

    # ===== STRATEGY 2: Try CTrain + Bus transfer =====
    # This is for trips like: Downtown → Blue Line → Saddletowne → Bus 145 → Destination
    transfer_result = await try_ctrain_bus_transfer(
        origin_coords, destination_coords, stops_df, trips_df, stop_times_df, routes_df
    )

    if transfer_result and transfer_result.get("success"):
        return transfer_result

    # ===== STRATEGY 3: Try Bus + CTrain transfer =====
    # For trips starting far from CTrain
    reverse_transfer_result = await try_bus_ctrain_transfer(
        origin_coords, destination_coords, stops_df, trips_df, stop_times_df, routes_df
    )

    if reverse_transfer_result and reverse_transfer_result.get("success"):
        return reverse_transfer_result

    # ===== STRATEGY 4: Try bus-only with more stops =====
    bus_only_result = await try_bus_only_route(
        origin_coords, destination_coords, stops_df, trips_df, stop_times_df, routes_df
    )

    if bus_only_result and bus_only_result.get("success"):
        return bus_only_result

    # No route found
    origin_stops = find_nearest_stops(
        origin_lat, origin_lng, stops_df, limit=5, max_distance=2000
    )
    dest_stops = find_nearest_stops(
        dest_lat, dest_lng, stops_df, limit=5, max_distance=2000
    )

    return {
        "success": False,
        "error": "No transit route found between locations",
        "suggestion": "The trip may require multiple transfers not currently supported, or the locations are too far from transit.",
        "origin_stops": origin_stops,
        "destination_stops": dest_stops,
    }


async def try_direct_route(
    origin_coords: Tuple[float, float],
    destination_coords: Tuple[float, float],
    stops_df: pd.DataFrame,
    trips_df: pd.DataFrame,
    stop_times_df: pd.DataFrame,
    routes_df: pd.DataFrame,
    prefer_lrt: bool = True,
) -> Optional[Dict]:
    """Try to find a direct route (single transit leg) - OPTIMIZED"""
    origin_lng, origin_lat = origin_coords
    dest_lng, dest_lat = destination_coords

    # Pre-compute lookups
    stop_trips, trip_routes = precompute_lookups(stop_times_df, trips_df)

    # Try LRT first if preferred
    if prefer_lrt:
        origin_lrt = find_nearest_stops(
            origin_lat,
            origin_lng,
            stops_df,
            limit=3,
            max_distance=3000,
            stop_type="LRT",
        )
        dest_lrt = find_nearest_stops(
            dest_lat, dest_lng, stops_df, limit=3, max_distance=3000, stop_type="LRT"
        )

        if origin_lrt and dest_lrt:
            for origin_stop in origin_lrt:
                for dest_stop in dest_lrt:
                    route = find_transit_route_fast(
                        origin_stop["stop_id"],
                        dest_stop["stop_id"],
                        stop_trips,
                        trip_routes,
                        routes_df,
                        stops_df,
                        stop_times_df,
                        origin_stop,
                        dest_stop,
                    )
                    if route:
                        return await build_single_leg_trip(
                            origin_coords,
                            destination_coords,
                            origin_stop,
                            dest_stop,
                            route,
                        )

    # Try all stops (including bus) - limited for speed
    origin_stops = find_nearest_stops(
        origin_lat, origin_lng, stops_df, limit=10, max_distance=1500
    )
    dest_stops = find_nearest_stops(
        dest_lat, dest_lng, stops_df, limit=10, max_distance=1500
    )

    best_route = None
    best_origin_stop = None
    best_dest_stop = None
    best_walk_distance = float("inf")

    for origin_stop in origin_stops:
        for dest_stop in dest_stops:
            route = find_transit_route_fast(
                origin_stop["stop_id"],
                dest_stop["stop_id"],
                stop_trips,
                trip_routes,
                routes_df,
                stops_df,
                stop_times_df,
                origin_stop,
                dest_stop,
            )
            if route:
                total_walk = origin_stop["distance"] + dest_stop["distance"]
                if total_walk < best_walk_distance:
                    best_route = route
                    best_origin_stop = origin_stop
                    best_dest_stop = dest_stop
                    best_walk_distance = total_walk

    if best_route:
        return await build_single_leg_trip(
            origin_coords,
            destination_coords,
            best_origin_stop,
            best_dest_stop,
            best_route,
        )

    return None


async def try_ctrain_bus_transfer(
    origin_coords: Tuple[float, float],
    destination_coords: Tuple[float, float],
    stops_df: pd.DataFrame,
    trips_df: pd.DataFrame,
    stop_times_df: pd.DataFrame,
    routes_df: pd.DataFrame,
) -> Optional[Dict]:
    """
    Try CTrain → Bus transfer route (OPTIMIZED)
    e.g., Downtown → Blue Line → Saddletowne → Bus 145 → Destination
    """
    origin_lng, origin_lat = origin_coords
    dest_lng, dest_lat = destination_coords

    # Pre-compute lookups for fast route finding
    stop_trips, trip_routes = precompute_lookups(stop_times_df, trips_df)

    # Find LRT stations near origin
    origin_lrt_stops = find_nearest_stops(
        origin_lat, origin_lng, stops_df, limit=3, max_distance=3000, stop_type="LRT"
    )

    if not origin_lrt_stops:
        return None

    # Find bus stops near destination (limit to 10 for speed)
    dest_bus_stops = find_nearest_stops(
        dest_lat, dest_lng, stops_df, limit=10, max_distance=1500, stop_type="BUS"
    )

    if not dest_bus_stops:
        return None

    # Get LRT stations that are closer to destination than origin (smart filtering)
    all_lrt_stations = get_all_lrt_stations(stops_df)

    # Filter to stations that make sense as transfer points
    # (closer to destination than to origin, and not too close to either)
    origin_to_dest_dist = haversine_distance(origin_lat, origin_lng, dest_lat, dest_lng)
    candidate_stations = []

    for station in all_lrt_stations:
        dist_from_origin = haversine_distance(
            origin_lat, origin_lng, station["stop_lat"], station["stop_lon"]
        )
        dist_to_dest = haversine_distance(
            station["stop_lat"], station["stop_lon"], dest_lat, dest_lng
        )

        # Station should be:
        # - At least 1km from origin
        # - Closer to destination than origin is
        # - Within reasonable distance of destination (for bus connection)
        if (
            dist_from_origin > 1000
            and dist_to_dest < origin_to_dest_dist
            and dist_to_dest < 15000  # 15km max from destination
        ):
            candidate_stations.append((station, dist_to_dest))

    # Sort by distance to destination and take top 5
    candidate_stations.sort(key=lambda x: x[1])
    candidate_stations = [s[0] for s in candidate_stations[:5]]

    best_trip = None
    best_total_time = float("inf")

    for transfer_station in candidate_stations:
        # Check CTrain route from origin to transfer station
        for origin_stop in origin_lrt_stops:
            ctrain_route = find_transit_route_fast(
                origin_stop["stop_id"],
                transfer_station["stop_id"],
                stop_trips,
                trip_routes,
                routes_df,
                stops_df,
                stop_times_df,
                origin_stop,
                transfer_station,
            )
            if not ctrain_route or ctrain_route["vehicle_type"] != "CTrain":
                continue

            # Find bus stops near the transfer station (limit to 5)
            transfer_bus_stops = find_nearest_stops(
                transfer_station["stop_lat"],
                transfer_station["stop_lon"],
                stops_df,
                limit=5,
                max_distance=800,
                stop_type="BUS",
            )

            # Check bus routes from transfer to destination
            for transfer_bus_stop in transfer_bus_stops:
                for dest_stop in dest_bus_stops[:5]:  # Limit destination stops
                    bus_route = find_transit_route_fast(
                        transfer_bus_stop["stop_id"],
                        dest_stop["stop_id"],
                        stop_trips,
                        trip_routes,
                        routes_df,
                        stops_df,
                        stop_times_df,
                        transfer_bus_stop,
                        dest_stop,
                    )
                    if bus_route and bus_route["vehicle_type"] == "Bus":
                        ctrain_time = ctrain_route["num_stops"] * 120
                        bus_time = bus_route["num_stops"] * 180
                        transfer_time = 300
                        walk_time = (
                            origin_stop["distance"] + dest_stop["distance"]
                        ) / 1.4
                        total_time = ctrain_time + bus_time + transfer_time + walk_time

                        if total_time < best_total_time:
                            best_total_time = total_time
                            best_trip = {
                                "origin_stop": origin_stop,
                                "ctrain_route": ctrain_route,
                                "transfer_station": transfer_station,
                                "transfer_bus_stop": transfer_bus_stop,
                                "bus_route": bus_route,
                                "dest_stop": dest_stop,
                            }
                            # Early exit if we found a reasonably good route
                            if total_time < 3600:  # Less than 1 hour
                                break
                if best_trip and best_total_time < 3600:
                    break
            if best_trip and best_total_time < 3600:
                break
        if best_trip and best_total_time < 3600:
            break

    if best_trip:
        return await build_transfer_trip(
            origin_coords, destination_coords, best_trip, "ctrain_bus"
        )

    return None


async def try_bus_ctrain_transfer(
    origin_coords: Tuple[float, float],
    destination_coords: Tuple[float, float],
    stops_df: pd.DataFrame,
    trips_df: pd.DataFrame,
    stop_times_df: pd.DataFrame,
    routes_df: pd.DataFrame,
) -> Optional[Dict]:
    """
    Try Bus → CTrain transfer route (OPTIMIZED)
    e.g., Origin → Bus → Station → CTrain → Downtown
    """
    origin_lng, origin_lat = origin_coords
    dest_lng, dest_lat = destination_coords

    # Pre-compute lookups
    stop_trips, trip_routes = precompute_lookups(stop_times_df, trips_df)

    # Find bus stops near origin (limit for speed)
    origin_bus_stops = find_nearest_stops(
        origin_lat, origin_lng, stops_df, limit=10, max_distance=1500, stop_type="BUS"
    )

    if not origin_bus_stops:
        return None

    # Find LRT stations near destination
    dest_lrt_stops = find_nearest_stops(
        dest_lat, dest_lng, stops_df, limit=3, max_distance=3000, stop_type="LRT"
    )

    if not dest_lrt_stops:
        return None

    # Get LRT stations - filter to those that make sense as transfer points
    all_lrt_stations = get_all_lrt_stations(stops_df)
    origin_to_dest_dist = haversine_distance(origin_lat, origin_lng, dest_lat, dest_lng)

    candidate_stations = []
    for station in all_lrt_stations:
        dist_from_origin = haversine_distance(
            origin_lat, origin_lng, station["stop_lat"], station["stop_lon"]
        )
        dist_to_dest = haversine_distance(
            station["stop_lat"], station["stop_lon"], dest_lat, dest_lng
        )

        # Station should be between origin and destination
        if (
            dist_to_dest > 1000
            and dist_from_origin < origin_to_dest_dist
            and dist_from_origin < 15000
        ):
            candidate_stations.append((station, dist_from_origin))

    # Sort by distance from origin and take top 5
    candidate_stations.sort(key=lambda x: x[1])
    candidate_stations = [s[0] for s in candidate_stations[:5]]

    best_trip = None
    best_total_time = float("inf")

    for transfer_station in candidate_stations:
        # Find bus stops near the transfer station
        transfer_bus_stops = find_nearest_stops(
            transfer_station["stop_lat"],
            transfer_station["stop_lon"],
            stops_df,
            limit=5,
            max_distance=800,
            stop_type="BUS",
        )

        # Check bus routes from origin to transfer
        for origin_stop in origin_bus_stops[:5]:
            for transfer_bus_stop in transfer_bus_stops:
                bus_route = find_transit_route_fast(
                    origin_stop["stop_id"],
                    transfer_bus_stop["stop_id"],
                    stop_trips,
                    trip_routes,
                    routes_df,
                    stops_df,
                    stop_times_df,
                    origin_stop,
                    transfer_bus_stop,
                )
                if not bus_route or bus_route["vehicle_type"] != "Bus":
                    continue

                # Check CTrain from transfer to destination
                for dest_stop in dest_lrt_stops:
                    ctrain_route = find_transit_route_fast(
                        transfer_station["stop_id"],
                        dest_stop["stop_id"],
                        stop_trips,
                        trip_routes,
                        routes_df,
                        stops_df,
                        stop_times_df,
                        transfer_station,
                        dest_stop,
                    )
                    if ctrain_route and ctrain_route["vehicle_type"] == "CTrain":
                        bus_time = bus_route["num_stops"] * 180
                        ctrain_time = ctrain_route["num_stops"] * 120
                        transfer_time = 300
                        walk_time = (
                            origin_stop["distance"] + dest_stop["distance"]
                        ) / 1.4
                        total_time = bus_time + ctrain_time + transfer_time + walk_time

                        if total_time < best_total_time:
                            best_total_time = total_time
                            best_trip = {
                                "origin_stop": origin_stop,
                                "bus_route": bus_route,
                                "transfer_bus_stop": transfer_bus_stop,
                                "transfer_station": transfer_station,
                                "ctrain_route": ctrain_route,
                                "dest_stop": dest_stop,
                            }
                            if total_time < 3600:
                                break
                if best_trip and best_total_time < 3600:
                    break
            if best_trip and best_total_time < 3600:
                break
        if best_trip and best_total_time < 3600:
            break

    if best_trip:
        return await build_transfer_trip(
            origin_coords, destination_coords, best_trip, "bus_ctrain"
        )

    return None


async def try_bus_only_route(
    origin_coords: Tuple[float, float],
    destination_coords: Tuple[float, float],
    stops_df: pd.DataFrame,
    trips_df: pd.DataFrame,
    stop_times_df: pd.DataFrame,
    routes_df: pd.DataFrame,
) -> Optional[Dict]:
    """Try to find a bus-only route with expanded search - OPTIMIZED"""
    origin_lng, origin_lat = origin_coords
    dest_lng, dest_lat = destination_coords

    # Pre-compute lookups
    stop_trips, trip_routes = precompute_lookups(stop_times_df, trips_df)

    # Search for bus stops (limited for speed)
    origin_stops = find_nearest_stops(
        origin_lat, origin_lng, stops_df, limit=15, max_distance=2000, stop_type="BUS"
    )
    dest_stops = find_nearest_stops(
        dest_lat, dest_lng, stops_df, limit=15, max_distance=2000, stop_type="BUS"
    )

    best_route = None
    best_origin_stop = None
    best_dest_stop = None
    best_walk_distance = float("inf")

    for origin_stop in origin_stops:
        for dest_stop in dest_stops:
            route = find_transit_route_fast(
                origin_stop["stop_id"],
                dest_stop["stop_id"],
                stop_trips,
                trip_routes,
                routes_df,
                stops_df,
                stop_times_df,
                origin_stop,
                dest_stop,
            )
            if route:
                total_walk = origin_stop["distance"] + dest_stop["distance"]
                if total_walk < best_walk_distance:
                    best_route = route
                    best_origin_stop = origin_stop
                    best_dest_stop = dest_stop
                    best_walk_distance = total_walk

    if best_route:
        return await build_single_leg_trip(
            origin_coords,
            destination_coords,
            best_origin_stop,
            best_dest_stop,
            best_route,
        )

    return None


async def build_single_leg_trip(
    origin_coords: Tuple[float, float],
    destination_coords: Tuple[float, float],
    origin_stop: Dict,
    dest_stop: Dict,
    route: Dict,
) -> Dict:
    """Build a single-leg trip plan"""
    segments = []
    total_duration = 0
    total_distance = 0

    # Walk to transit stop
    walk_to_stop = await get_walking_directions(
        origin_coords, (origin_stop["stop_lon"], origin_stop["stop_lat"])
    )

    if walk_to_stop:
        segments.append(
            {
                "type": "walk",
                "instruction": f"Walk to {origin_stop['stop_name']}",
                "distance": walk_to_stop["distance"],
                "duration": walk_to_stop["duration"],
                "geometry": walk_to_stop["geometry"],
                "steps": walk_to_stop.get("steps", []),
                "from": {"name": "Starting point", "coordinates": list(origin_coords)},
                "to": {
                    "name": origin_stop["stop_name"],
                    "coordinates": [origin_stop["stop_lon"], origin_stop["stop_lat"]],
                },
            }
        )
        total_duration += walk_to_stop["duration"]
        total_distance += walk_to_stop["distance"]

    # Transit segment
    transit_time_per_stop = 120 if route["vehicle_type"] == "CTrain" else 180
    transit_duration = route["num_stops"] * transit_time_per_stop

    transit_segment = {
        "type": "transit",
        "instruction": f"Take {route['line']} ({route['vehicle_type']})",
        "line": route["line"],
        "vehicle_type": route["vehicle_type"],
        "color": route["color"],
        "route_id": route["route_id"],
        "num_stops": route["num_stops"],
        "duration": transit_duration,
        "from": {
            "name": origin_stop["stop_name"],
            "coordinates": [origin_stop["stop_lon"], origin_stop["stop_lat"]],
        },
        "to": {
            "name": dest_stop["stop_name"],
            "coordinates": [dest_stop["stop_lon"], dest_stop["stop_lat"]],
        },
    }

    # Get road geometry for bus routes
    if route["vehicle_type"] != "CTrain":
        bus_directions = await get_driving_directions(
            (origin_stop["stop_lon"], origin_stop["stop_lat"]),
            (dest_stop["stop_lon"], dest_stop["stop_lat"]),
        )
        if bus_directions:
            transit_segment["geometry"] = bus_directions["geometry"]

    segments.append(transit_segment)
    total_duration += transit_duration

    # Walk from transit stop to destination
    walk_from_stop = await get_walking_directions(
        (dest_stop["stop_lon"], dest_stop["stop_lat"]), destination_coords
    )

    if walk_from_stop:
        segments.append(
            {
                "type": "walk",
                "instruction": "Walk to your destination",
                "distance": walk_from_stop["distance"],
                "duration": walk_from_stop["duration"],
                "geometry": walk_from_stop["geometry"],
                "steps": walk_from_stop.get("steps", []),
                "from": {
                    "name": dest_stop["stop_name"],
                    "coordinates": [dest_stop["stop_lon"], dest_stop["stop_lat"]],
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
            "transit_line": route["line"],
            "transit_type": route["vehicle_type"],
            "num_transfers": 0,
        },
        "origin": {"coordinates": list(origin_coords)},
        "destination": {"coordinates": list(destination_coords)},
        "segments": segments,
    }


async def build_transfer_trip(
    origin_coords: Tuple[float, float],
    destination_coords: Tuple[float, float],
    trip_info: Dict,
    transfer_type: str,  # "ctrain_bus" or "bus_ctrain"
) -> Dict:
    """Build a multi-leg trip plan with transfer"""
    segments = []
    total_duration = 0
    total_distance = 0
    transit_lines = []

    if transfer_type == "ctrain_bus":
        origin_stop = trip_info["origin_stop"]
        ctrain_route = trip_info["ctrain_route"]
        transfer_station = trip_info["transfer_station"]
        transfer_bus_stop = trip_info["transfer_bus_stop"]
        bus_route = trip_info["bus_route"]
        dest_stop = trip_info["dest_stop"]

        # 1. Walk to CTrain station
        walk_to_ctrain = await get_walking_directions(
            origin_coords, (origin_stop["stop_lon"], origin_stop["stop_lat"])
        )
        if walk_to_ctrain:
            segments.append(
                {
                    "type": "walk",
                    "instruction": f"Walk to {origin_stop['stop_name']}",
                    "distance": walk_to_ctrain["distance"],
                    "duration": walk_to_ctrain["duration"],
                    "geometry": walk_to_ctrain["geometry"],
                    "from": {
                        "name": "Starting point",
                        "coordinates": list(origin_coords),
                    },
                    "to": {
                        "name": origin_stop["stop_name"],
                        "coordinates": [
                            origin_stop["stop_lon"],
                            origin_stop["stop_lat"],
                        ],
                    },
                }
            )
            total_duration += walk_to_ctrain["duration"]
            total_distance += walk_to_ctrain["distance"]

        # 2. Take CTrain to transfer station
        ctrain_duration = ctrain_route["num_stops"] * 120
        segments.append(
            {
                "type": "transit",
                "instruction": f"Take {ctrain_route['line']} to {transfer_station['stop_name']}",
                "line": ctrain_route["line"],
                "vehicle_type": "CTrain",
                "color": ctrain_route["color"],
                "route_id": ctrain_route["route_id"],
                "num_stops": ctrain_route["num_stops"],
                "duration": ctrain_duration,
                "from": {
                    "name": origin_stop["stop_name"],
                    "coordinates": [origin_stop["stop_lon"], origin_stop["stop_lat"]],
                },
                "to": {
                    "name": transfer_station["stop_name"],
                    "coordinates": [
                        transfer_station["stop_lon"],
                        transfer_station["stop_lat"],
                    ],
                },
            }
        )
        total_duration += ctrain_duration
        transit_lines.append(ctrain_route["line"])

        # 3. Walk to bus stop (transfer)
        walk_to_bus = await get_walking_directions(
            (transfer_station["stop_lon"], transfer_station["stop_lat"]),
            (transfer_bus_stop["stop_lon"], transfer_bus_stop["stop_lat"]),
        )
        if walk_to_bus and walk_to_bus["distance"] > 50:
            segments.append(
                {
                    "type": "walk",
                    "instruction": f"Walk to {transfer_bus_stop['stop_name']} (transfer)",
                    "distance": walk_to_bus["distance"],
                    "duration": walk_to_bus["duration"],
                    "geometry": walk_to_bus["geometry"],
                    "from": {
                        "name": transfer_station["stop_name"],
                        "coordinates": [
                            transfer_station["stop_lon"],
                            transfer_station["stop_lat"],
                        ],
                    },
                    "to": {
                        "name": transfer_bus_stop["stop_name"],
                        "coordinates": [
                            transfer_bus_stop["stop_lon"],
                            transfer_bus_stop["stop_lat"],
                        ],
                    },
                }
            )
            total_duration += walk_to_bus["duration"]
            total_distance += walk_to_bus["distance"]

        # 4. Take bus to destination area
        bus_duration = bus_route["num_stops"] * 180
        bus_segment = {
            "type": "transit",
            "instruction": f"Take {bus_route['line']} to {dest_stop['stop_name']}",
            "line": bus_route["line"],
            "vehicle_type": "Bus",
            "color": "#22c55e",
            "route_id": bus_route["route_id"],
            "num_stops": bus_route["num_stops"],
            "duration": bus_duration,
            "from": {
                "name": transfer_bus_stop["stop_name"],
                "coordinates": [
                    transfer_bus_stop["stop_lon"],
                    transfer_bus_stop["stop_lat"],
                ],
            },
            "to": {
                "name": dest_stop["stop_name"],
                "coordinates": [dest_stop["stop_lon"], dest_stop["stop_lat"]],
            },
        }

        # Get road geometry for bus
        bus_directions = await get_driving_directions(
            (transfer_bus_stop["stop_lon"], transfer_bus_stop["stop_lat"]),
            (dest_stop["stop_lon"], dest_stop["stop_lat"]),
        )
        if bus_directions:
            bus_segment["geometry"] = bus_directions["geometry"]

        segments.append(bus_segment)
        total_duration += bus_duration
        transit_lines.append(bus_route["line"])

        # 5. Walk to final destination
        walk_to_dest = await get_walking_directions(
            (dest_stop["stop_lon"], dest_stop["stop_lat"]), destination_coords
        )
        if walk_to_dest:
            segments.append(
                {
                    "type": "walk",
                    "instruction": "Walk to your destination",
                    "distance": walk_to_dest["distance"],
                    "duration": walk_to_dest["duration"],
                    "geometry": walk_to_dest["geometry"],
                    "from": {
                        "name": dest_stop["stop_name"],
                        "coordinates": [dest_stop["stop_lon"], dest_stop["stop_lat"]],
                    },
                    "to": {
                        "name": "Destination",
                        "coordinates": list(destination_coords),
                    },
                }
            )
            total_duration += walk_to_dest["duration"]
            total_distance += walk_to_dest["distance"]

    elif transfer_type == "bus_ctrain":
        origin_stop = trip_info["origin_stop"]
        bus_route = trip_info["bus_route"]
        transfer_bus_stop = trip_info["transfer_bus_stop"]
        transfer_station = trip_info["transfer_station"]
        ctrain_route = trip_info["ctrain_route"]
        dest_stop = trip_info["dest_stop"]

        # 1. Walk to bus stop
        walk_to_bus = await get_walking_directions(
            origin_coords, (origin_stop["stop_lon"], origin_stop["stop_lat"])
        )
        if walk_to_bus:
            segments.append(
                {
                    "type": "walk",
                    "instruction": f"Walk to {origin_stop['stop_name']}",
                    "distance": walk_to_bus["distance"],
                    "duration": walk_to_bus["duration"],
                    "geometry": walk_to_bus["geometry"],
                    "from": {
                        "name": "Starting point",
                        "coordinates": list(origin_coords),
                    },
                    "to": {
                        "name": origin_stop["stop_name"],
                        "coordinates": [
                            origin_stop["stop_lon"],
                            origin_stop["stop_lat"],
                        ],
                    },
                }
            )
            total_duration += walk_to_bus["duration"]
            total_distance += walk_to_bus["distance"]

        # 2. Take bus to transfer area
        bus_duration = bus_route["num_stops"] * 180
        bus_segment = {
            "type": "transit",
            "instruction": f"Take {bus_route['line']} to {transfer_bus_stop['stop_name']}",
            "line": bus_route["line"],
            "vehicle_type": "Bus",
            "color": "#22c55e",
            "route_id": bus_route["route_id"],
            "num_stops": bus_route["num_stops"],
            "duration": bus_duration,
            "from": {
                "name": origin_stop["stop_name"],
                "coordinates": [origin_stop["stop_lon"], origin_stop["stop_lat"]],
            },
            "to": {
                "name": transfer_bus_stop["stop_name"],
                "coordinates": [
                    transfer_bus_stop["stop_lon"],
                    transfer_bus_stop["stop_lat"],
                ],
            },
        }

        bus_directions = await get_driving_directions(
            (origin_stop["stop_lon"], origin_stop["stop_lat"]),
            (transfer_bus_stop["stop_lon"], transfer_bus_stop["stop_lat"]),
        )
        if bus_directions:
            bus_segment["geometry"] = bus_directions["geometry"]

        segments.append(bus_segment)
        total_duration += bus_duration
        transit_lines.append(bus_route["line"])

        # 3. Walk to CTrain station (transfer)
        walk_to_ctrain = await get_walking_directions(
            (transfer_bus_stop["stop_lon"], transfer_bus_stop["stop_lat"]),
            (transfer_station["stop_lon"], transfer_station["stop_lat"]),
        )
        if walk_to_ctrain and walk_to_ctrain["distance"] > 50:
            segments.append(
                {
                    "type": "walk",
                    "instruction": f"Walk to {transfer_station['stop_name']} (transfer)",
                    "distance": walk_to_ctrain["distance"],
                    "duration": walk_to_ctrain["duration"],
                    "geometry": walk_to_ctrain["geometry"],
                    "from": {
                        "name": transfer_bus_stop["stop_name"],
                        "coordinates": [
                            transfer_bus_stop["stop_lon"],
                            transfer_bus_stop["stop_lat"],
                        ],
                    },
                    "to": {
                        "name": transfer_station["stop_name"],
                        "coordinates": [
                            transfer_station["stop_lon"],
                            transfer_station["stop_lat"],
                        ],
                    },
                }
            )
            total_duration += walk_to_ctrain["duration"]
            total_distance += walk_to_ctrain["distance"]

        # 4. Take CTrain to destination
        ctrain_duration = ctrain_route["num_stops"] * 120
        segments.append(
            {
                "type": "transit",
                "instruction": f"Take {ctrain_route['line']} to {dest_stop['stop_name']}",
                "line": ctrain_route["line"],
                "vehicle_type": "CTrain",
                "color": ctrain_route["color"],
                "route_id": ctrain_route["route_id"],
                "num_stops": ctrain_route["num_stops"],
                "duration": ctrain_duration,
                "from": {
                    "name": transfer_station["stop_name"],
                    "coordinates": [
                        transfer_station["stop_lon"],
                        transfer_station["stop_lat"],
                    ],
                },
                "to": {
                    "name": dest_stop["stop_name"],
                    "coordinates": [dest_stop["stop_lon"], dest_stop["stop_lat"]],
                },
            }
        )
        total_duration += ctrain_duration
        transit_lines.append(ctrain_route["line"])

        # 5. Walk to final destination
        walk_to_dest = await get_walking_directions(
            (dest_stop["stop_lon"], dest_stop["stop_lat"]), destination_coords
        )
        if walk_to_dest:
            segments.append(
                {
                    "type": "walk",
                    "instruction": "Walk to your destination",
                    "distance": walk_to_dest["distance"],
                    "duration": walk_to_dest["duration"],
                    "geometry": walk_to_dest["geometry"],
                    "from": {
                        "name": dest_stop["stop_name"],
                        "coordinates": [dest_stop["stop_lon"], dest_stop["stop_lat"]],
                    },
                    "to": {
                        "name": "Destination",
                        "coordinates": list(destination_coords),
                    },
                }
            )
            total_duration += walk_to_dest["duration"]
            total_distance += walk_to_dest["distance"]

    return {
        "success": True,
        "summary": {
            "total_duration": total_duration,
            "total_duration_text": format_duration(total_duration),
            "total_walking_distance": total_distance,
            "total_walking_distance_text": format_distance(total_distance),
            "transit_line": " → ".join(transit_lines),
            "transit_type": (
                "CTrain + Bus" if transfer_type == "ctrain_bus" else "Bus + CTrain"
            ),
            "num_transfers": 1,
        },
        "origin": {"coordinates": list(origin_coords)},
        "destination": {"coordinates": list(destination_coords)},
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
