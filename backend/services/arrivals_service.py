"""
Arrivals Service
Provides real-time arrival predictions for transit stops - like the Transit app!
"""

import math
from datetime import datetime
from typing import Dict, Optional

from services.gtfs_service import (
    get_all_stops,
    get_realtime_arrivals,
    get_route,
    get_routes_serving_stop,
    get_stop,
    get_vehicle_positions,
    refresh_realtime_data,
)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in meters"""
    R = 6371000

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


async def get_stop_arrivals(
    stop_id: str,
    limit: int = 10,
    route_filter: Optional[str] = None,
    vehicle_type_filter: Optional[str] = None,
) -> Dict:
    """
    Get upcoming arrivals for a specific stop.
    This is the main function for "when is my bus/train coming?"

    Args:
        stop_id: The stop ID (e.g., "7012" for a bus stop or LRT station)
        limit: Maximum number of arrivals to return
        route_filter: Filter by route short name (e.g., "201" for Red Line, "3" for Bus 3)
        vehicle_type_filter: Filter by vehicle type ("CTrain" or "Bus")

    Returns:
        Dict with stop info and list of upcoming arrivals
    """
    stop_info = get_stop(stop_id)
    if not stop_info:
        return {"error": f"Stop {stop_id} not found", "arrivals": []}

    arrivals = await get_realtime_arrivals(stop_id)

    if route_filter:
        arrivals = [a for a in arrivals if a.get("route_short_name") == route_filter]
    if vehicle_type_filter:
        arrivals = [a for a in arrivals if a.get("vehicle_type") == vehicle_type_filter]

    routes = get_routes_serving_stop(stop_id)

    return {
        "stop": {
            "stop_id": stop_info.get("stop_id"),
            "stop_code": stop_info.get("stop_code"),
            "stop_name": stop_info.get("stop_name"),
            "coordinates": {
                "latitude": stop_info.get("stop_lat"),
                "longitude": stop_info.get("stop_lon"),
            },
        },
        "routes_serving": [
            {
                "route_id": r.get("route_id"),
                "route_short_name": r.get("route_short_name"),
                "route_long_name": r.get("route_long_name"),
                "vehicle_type": r.get("vehicle_type"),
                "line": r.get("line"),
                "color": r.get("color"),
            }
            for r in routes
        ],
        "arrivals": arrivals[:limit],
        "total_arrivals": len(arrivals),
        "timestamp": datetime.now().isoformat(),
    }


async def get_nearby_stops_with_arrivals(
    latitude: float,
    longitude: float,
    radius_meters: float = 500,
    limit_stops: int = 5,
    limit_arrivals_per_stop: int = 3,
    vehicle_type_filter: Optional[str] = None,
) -> Dict:
    """
    Get nearby stops with their upcoming arrivals.
    Like the Transit app's home screen showing nearby departures.

    Args:
        latitude: User's latitude
        longitude: User's longitude
        radius_meters: Search radius in meters (default 500m)
        limit_stops: Maximum number of stops to return
        limit_arrivals_per_stop: Maximum arrivals per stop
        vehicle_type_filter: Filter by vehicle type ("CTrain" or "Bus")

    Returns:
        Dict with list of nearby stops and their arrivals
    """
    all_stops = get_all_stops()

    stops_with_distance = []
    for stop in all_stops:
        distance = haversine_distance(
            latitude, longitude, stop.get("stop_lat"), stop.get("stop_lon")
        )

        if distance <= radius_meters:
            stops_with_distance.append(
                {
                    **stop,
                    "distance_meters": round(distance),
                }
            )

    # Sort by distance
    stops_with_distance.sort(key=lambda x: x["distance_meters"])

    # Get arrivals for each stop
    nearby_stops = []
    stops_checked = 0
    # When filtering by vehicle type, check more stops since many might not match
    max_stops_to_check = limit_stops * 20 if vehicle_type_filter else limit_stops * 4

    for stop in stops_with_distance:
        if len(nearby_stops) >= limit_stops or stops_checked >= max_stops_to_check:
            break

        stops_checked += 1
        stop_id = stop.get("stop_id")

        # Get routes serving this stop to check vehicle type
        routes = get_routes_serving_stop(stop_id)

        # If filtering by vehicle type, check if this stop has matching routes
        if vehicle_type_filter:
            matching_routes = [
                r for r in routes if r.get("vehicle_type") == vehicle_type_filter
            ]
            if not matching_routes:
                continue  # Skip this stop if no matching routes
            routes = matching_routes  # Only show matching routes

        arrivals = await get_realtime_arrivals(stop_id)

        # Apply arrival filter
        if vehicle_type_filter:
            arrivals = [
                a for a in arrivals if a.get("vehicle_type") == vehicle_type_filter
            ]

        nearby_stops.append(
            {
                "stop": {
                    "stop_id": stop.get("stop_id"),
                    "stop_code": stop.get("stop_code"),
                    "stop_name": stop.get("stop_name"),
                    "coordinates": {
                        "latitude": stop.get("stop_lat"),
                        "longitude": stop.get("stop_lon"),
                    },
                    "distance_meters": stop.get("distance_meters"),
                },
                "routes": [
                    {
                        "route_short_name": r.get("route_short_name"),
                        "vehicle_type": r.get("vehicle_type"),
                        "color": r.get("color"),
                    }
                    for r in routes[:5]
                ],
                "arrivals": arrivals[:limit_arrivals_per_stop],
            }
        )

    return {
        "location": {
            "latitude": latitude,
            "longitude": longitude,
        },
        "radius_meters": radius_meters,
        "stops": nearby_stops,
        "total_stops_found": len(stops_with_distance),
        "timestamp": datetime.now().isoformat(),
    }


async def get_station_arrivals(
    station_name: str,
    line: Optional[str] = None,
    limit: int = 10,
) -> Dict:
    """
    Get arrivals for a CTrain station by name.
    Convenience function for LRT stations.

    Args:
        station_name: Station name (e.g., "Sunnyside", "Downtown West")
        line: Optional line filter ("Red" or "Blue")
        limit: Maximum arrivals to return
    """
    all_stops = get_all_stops()

    matching_stops = []
    station_name_lower = station_name.lower()
    
    search_terms = [station_name_lower]
    for suffix in [" station", " ctrain station", " lrt station", " stn"]:
        if station_name_lower.endswith(suffix):
            cleaned = station_name_lower[:-len(suffix)]
            search_terms.append(cleaned)
            parts = [p.strip() for p in cleaned.replace("/", " / ").split()]
            for part in parts:
                if len(part) >= 3 and part != "/":
                    search_terms.append(part)
    
    search_terms = list(set(search_terms))
    
    for stop in all_stops:
        stop_name = stop.get("stop_name", "").lower()
        # Match LRT stations
        for search_term in search_terms:
            if search_term in stop_name:
                matching_stops.append(stop)
                break  # Only add once per stop

    if not matching_stops:
        return {"error": f"Station '{station_name}' not found", "arrivals": []}

    # Get arrivals for all matching stops (some stations have multiple platforms)
    all_arrivals = []
    for stop in matching_stops:
        arrivals = await get_realtime_arrivals(stop.get("stop_id"))

        # Filter for CTrain only
        arrivals = [a for a in arrivals if a.get("vehicle_type") == "CTrain"]

        # Apply line filter
        if line:
            line_lower = line.lower()
            arrivals = [
                a
                for a in arrivals
                if a.get("line") and line_lower in a.get("line", "").lower()
            ]

        all_arrivals.extend(arrivals)

    # Sort by arrival time and deduplicate
    all_arrivals.sort(key=lambda x: x.get("arrival_timestamp", 0))

    # Deduplicate by trip_id
    seen_trips = set()
    unique_arrivals = []
    for arrival in all_arrivals:
        trip_id = arrival.get("trip_id")
        if trip_id not in seen_trips:
            seen_trips.add(trip_id)
            unique_arrivals.append(arrival)

    return {
        "station": {
            "name": station_name,
            "stops": [
                {
                    "stop_id": s.get("stop_id"),
                    "stop_name": s.get("stop_name"),
                }
                for s in matching_stops
            ],
        },
        "line_filter": line,
        "arrivals": unique_arrivals[:limit],
        "total_arrivals": len(unique_arrivals),
        "timestamp": datetime.now().isoformat(),
    }


async def get_route_schedule(
    route_id: str,
    stop_id: Optional[str] = None,
    limit: int = 20,
) -> Dict:
    """
    Get schedule and real-time arrivals for a specific route.

    Args:
        route_id: Route ID (e.g., "201" for Red Line)
        stop_id: Optional specific stop to get arrivals for
        limit: Maximum arrivals to return
    """
    route_info = get_route(route_id)
    if not route_info:
        return {"error": f"Route {route_id} not found", "arrivals": []}

    # Refresh real-time data
    await refresh_realtime_data()

    # Get all vehicles on this route
    vehicles = await get_vehicle_positions(route_id=route_id)

    result = {
        "route": route_info,
        "active_vehicles": len(vehicles),
        "vehicles": [
            {
                "vehicle_id": v.get("vehicle_id"),
                "position": v.get("position"),
                "headsign": v.get("headsign"),
                "current_status": v.get("current_status"),
            }
            for v in vehicles
        ],
        "timestamp": datetime.now().isoformat(),
    }

    if stop_id:
        arrivals = await get_realtime_arrivals(stop_id)
        arrivals = [a for a in arrivals if a.get("route_id") == route_id]
        result["arrivals_at_stop"] = arrivals[:limit]
        result["stop_id"] = stop_id

    return result


async def get_all_ctrain_arrivals(line: Optional[str] = None) -> Dict:
    """
    Get all CTrain arrivals across the network.
    Useful for system-wide view.
    """
    await refresh_realtime_data()

    # Get all CTrain vehicles
    vehicles = await get_vehicle_positions(vehicle_type="CTrain")

    if line:
        vehicles = [
            v
            for v in vehicles
            if v.get("line") and line.lower() in v.get("line", "").lower()
        ]

    return {
        "line_filter": line,
        "active_trains": len(vehicles),
        "vehicles": [
            {
                "vehicle_id": v.get("vehicle_id"),
                "trip_id": v.get("trip_id"),
                "line": v.get("line"),
                "color": v.get("color"),
                "headsign": v.get("headsign"),
                "position": v.get("position"),
            }
            for v in vehicles
        ],
        "timestamp": datetime.now().isoformat(),
    }


def format_arrival_time(minutes_away: int) -> str:
    """Format arrival time for display"""
    if minutes_away <= 0:
        return "Arriving"
    elif minutes_away == 1:
        return "1 min"
    elif minutes_away < 60:
        return f"{minutes_away} min"
    else:
        hours = minutes_away // 60
        mins = minutes_away % 60
        if mins == 0:
            return f"{hours} hr"
        return f"{hours}:{mins:02d}"
