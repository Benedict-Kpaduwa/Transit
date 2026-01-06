"""
Trip Planning Service
Provides journey planning using GTFS data - finding routes between two locations
"""

import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import httpx
from config import settings
from services.gtfs_service import (
    _gtfs_cache,
    get_all_stops,
    get_route,
    get_routes_serving_stop,
    get_scheduled_stop_times,
    get_stop,
    get_trip,
    get_trip_stop_times,
)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in meters"""
    R = 6371000  # Earth radius in meters

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


def find_nearby_stops(
    latitude: float,
    longitude: float,
    radius_meters: float = 1000,
    limit: int = 10,
    vehicle_type: Optional[str] = None,
) -> List[Dict]:
    """Find stops within radius of a location"""
    all_stops = get_all_stops()

    nearby = []
    for stop in all_stops:
        distance = haversine_distance(
            latitude, longitude, stop.get("stop_lat"), stop.get("stop_lon")
        )

        if distance <= radius_meters:
            # Get routes serving this stop to determine vehicle type
            routes = get_routes_serving_stop(stop.get("stop_id"))

            # Determine if this stop serves the requested vehicle type
            stop_vehicle_types = set(r.get("vehicle_type") for r in routes)

            if vehicle_type and vehicle_type not in stop_vehicle_types:
                continue

            nearby.append(
                {
                    "stop_id": stop.get("stop_id"),
                    "stop_code": stop.get("stop_code"),
                    "stop_name": stop.get("stop_name"),
                    "latitude": stop.get("stop_lat"),
                    "longitude": stop.get("stop_lon"),
                    "distance_meters": round(distance),
                    "vehicle_types": list(stop_vehicle_types),
                    "routes": [
                        {
                            "route_id": r.get("route_id"),
                            "route_short_name": r.get("route_short_name"),
                            "vehicle_type": r.get("vehicle_type"),
                            "line": r.get("line"),
                            "color": r.get("color"),
                        }
                        for r in routes[:5]
                    ],
                }
            )

    # Sort by distance and limit
    nearby.sort(key=lambda x: x["distance_meters"])
    return nearby[:limit]


async def geocode_location(
    query: str, proximity: Optional[Tuple[float, float]] = None
) -> List[Dict]:
    """
    Geocode an address or place name using Mapbox

    Args:
        query: Address or place name
        proximity: Optional (lng, lat) tuple for proximity bias

    Returns:
        List of geocoding results
    """
    if not settings.mapbox_access_token:
        raise ValueError("Mapbox access token not configured")

    # Calgary bounding box for relevance
    bbox = "-114.3155,50.8427,-113.8607,51.2125"

    params = {
        "access_token": settings.mapbox_access_token,
        "bbox": bbox,
        "limit": 5,
        "types": "address,poi,neighborhood,locality,place",
    }

    if proximity:
        params["proximity"] = f"{proximity[0]},{proximity[1]}"

    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json"

    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

    results = []
    for feature in data.get("features", []):
        results.append(
            {
                "name": feature.get("text"),
                "full_address": feature.get("place_name"),
                "coordinates": {
                    "longitude": feature["geometry"]["coordinates"][0],
                    "latitude": feature["geometry"]["coordinates"][1],
                },
            }
        )

    return results


async def get_walking_directions(
    origin: Tuple[float, float],
    destination: Tuple[float, float],
) -> Optional[Dict]:
    """
    Get walking directions between two points

    Args:
        origin: (longitude, latitude) of start
        destination: (longitude, latitude) of end

    Returns:
        Walking route with geometry and duration
    """
    if not settings.mapbox_access_token:
        return None

    url = f"https://api.mapbox.com/directions/v5/mapbox/walking/{origin[0]},{origin[1]};{destination[0]},{destination[1]}"

    params = {
        "access_token": settings.mapbox_access_token,
        "geometries": "geojson",
        "overview": "full",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

        if data.get("routes"):
            route = data["routes"][0]
            return {
                "distance_meters": round(route["distance"]),
                "duration_seconds": round(route["duration"]),
                "duration_minutes": round(route["duration"] / 60, 1),
                "geometry": route["geometry"],
            }
    except Exception as e:
        print(f"Error getting walking directions: {e}")

    return None


def find_connecting_routes(
    origin_stop_id: str,
    destination_stop_id: str,
) -> List[Dict]:
    """
    Find routes that connect two stops (i.e., serve both stops).
    This is the core of transit routing.

    Returns list of routes that serve both stops, with stop sequence info.
    """
    origin_stop_times = _gtfs_cache.get("stop_times_by_stop", {}).get(
        str(origin_stop_id), []
    )
    dest_stop_times = _gtfs_cache.get("stop_times_by_stop", {}).get(
        str(destination_stop_id), []
    )

    if not origin_stop_times or not dest_stop_times:
        return []

    # Get trips that serve origin stop
    origin_trips = set()
    for st in origin_stop_times:
        origin_trips.add(st.get("trip_id"))

    # Get trips that serve destination stop
    dest_trips = set()
    for st in dest_stop_times:
        dest_trips.add(st.get("trip_id"))

    # Find trips that serve both
    common_trips = origin_trips.intersection(dest_trips)

    if not common_trips:
        return []

    # Group by route and check direction
    routes_found = {}

    for trip_id in common_trips:
        trip_info = get_trip(trip_id)
        if not trip_info:
            continue

        route_id = trip_info.get("route_id")
        route_info = get_route(route_id)

        if not route_info:
            continue

        # Get the stop times for this trip
        trip_stop_times = get_trip_stop_times(trip_id)

        # Find sequences for origin and destination
        origin_seq = None
        dest_seq = None
        origin_time = None
        dest_time = None

        for st in trip_stop_times:
            if st.get("stop_id") == str(origin_stop_id):
                origin_seq = st.get("stop_sequence")
                origin_time = st.get("departure_time")
            if st.get("stop_id") == str(destination_stop_id):
                dest_seq = st.get("stop_sequence")
                dest_time = st.get("arrival_time")

        # Only include if origin comes before destination (correct direction)
        if origin_seq is not None and dest_seq is not None and origin_seq < dest_seq:
            key = f"{route_id}_{trip_info.get('direction_id', 0)}"

            if key not in routes_found:
                routes_found[key] = {
                    "route_id": route_id,
                    "route_short_name": route_info.get("route_short_name"),
                    "route_long_name": route_info.get("route_long_name"),
                    "vehicle_type": route_info.get("vehicle_type"),
                    "line": route_info.get("line"),
                    "color": route_info.get("color"),
                    "direction_id": trip_info.get("direction_id"),
                    "headsign": trip_info.get("trip_headsign"),
                    "stops_count": dest_seq - origin_seq,
                    "sample_trip_id": trip_id,
                }

    return list(routes_found.values())


def get_intermediate_stops(
    trip_id: str, origin_stop_id: str, destination_stop_id: str
) -> List[Dict]:
    """
    Get all stops between origin and destination for a specific trip.
    """
    trip_stop_times = get_trip_stop_times(trip_id)

    origin_seq = None
    dest_seq = None

    # Find sequences
    for st in trip_stop_times:
        if st.get("stop_id") == str(origin_stop_id):
            origin_seq = st.get("stop_sequence")
        if st.get("stop_id") == str(destination_stop_id):
            dest_seq = st.get("stop_sequence")

    if origin_seq is None or dest_seq is None:
        return []

    # Get intermediate stops
    stops = []
    for st in trip_stop_times:
        seq = st.get("stop_sequence")
        if origin_seq <= seq <= dest_seq:
            stop_info = get_stop(st.get("stop_id"))
            stops.append(
                {
                    "stop_id": st.get("stop_id"),
                    "stop_name": stop_info.get("stop_name") if stop_info else "Unknown",
                    "stop_sequence": seq,
                    "arrival_time": st.get("arrival_time"),
                    "departure_time": st.get("departure_time"),
                    "coordinates": {
                        "latitude": stop_info.get("stop_lat") if stop_info else None,
                        "longitude": stop_info.get("stop_lon") if stop_info else None,
                    },
                }
            )

    return stops


async def plan_trip(
    origin: Tuple[float, float],
    destination: Tuple[float, float],
    prefer_lrt: bool = True,
) -> Dict:
    """
    Plan a transit trip from origin to destination.

    Args:
        origin: (longitude, latitude) of start
        destination: (longitude, latitude) of end
        prefer_lrt: Whether to prefer CTrain routes

    Returns:
        Trip plan with walking and transit segments
    """
    origin_lng, origin_lat = origin
    dest_lng, dest_lat = destination

    # Find nearby stops at origin and destination
    origin_stops = find_nearby_stops(
        origin_lat,
        origin_lng,
        radius_meters=1500,
        limit=10,
    )

    dest_stops = find_nearby_stops(
        dest_lat,
        dest_lng,
        radius_meters=1500,
        limit=10,
    )

    if not origin_stops:
        return {
            "success": False,
            "error": "No transit stops found near origin",
            "suggestion": "Try a location closer to transit",
        }

    if not dest_stops:
        return {
            "success": False,
            "error": "No transit stops found near destination",
            "suggestion": "Try a location closer to transit",
        }

    # Try to find direct routes
    best_route = None

    # Sort origin stops by preference (LRT first if preferred, then by distance)
    if prefer_lrt:
        origin_stops.sort(
            key=lambda s: (
                0 if "CTrain" in s.get("vehicle_types", []) else 1,
                s.get("distance_meters", 9999),
            )
        )
        dest_stops.sort(
            key=lambda s: (
                0 if "CTrain" in s.get("vehicle_types", []) else 1,
                s.get("distance_meters", 9999),
            )
        )

    # Try each combination of origin/destination stops
    for origin_stop in origin_stops[:5]:
        for dest_stop in dest_stops[:5]:
            # Find connecting routes
            routes = find_connecting_routes(
                origin_stop.get("stop_id"), dest_stop.get("stop_id")
            )

            if routes:
                # Prefer CTrain if specified
                if prefer_lrt:
                    routes.sort(
                        key=lambda r: (
                            0 if r.get("vehicle_type") == "CTrain" else 1,
                            r.get("stops_count", 999),
                        )
                    )
                else:
                    routes.sort(key=lambda r: r.get("stops_count", 999))

                selected_route = routes[0]

                # Calculate total walking distance
                walk_to_stop = origin_stop.get("distance_meters", 0)
                walk_from_stop = dest_stop.get("distance_meters", 0)

                # Score: prefer less walking and fewer stops
                score = (
                    walk_to_stop
                    + walk_from_stop
                    + (selected_route.get("stops_count", 0) * 50)
                )

                if best_route is None or score < best_route.get("score", float("inf")):
                    best_route = {
                        "origin_stop": origin_stop,
                        "dest_stop": dest_stop,
                        "route": selected_route,
                        "all_routes": routes,
                        "score": score,
                    }

    if not best_route:
        # Try transfer routes (CTrain to Bus or Bus to CTrain)
        transfer_route = await find_transfer_route(
            origin_lat, origin_lng, dest_lat, dest_lng, origin_stops, dest_stops
        )

        if transfer_route:
            return transfer_route

        return {
            "success": False,
            "error": "No direct route found",
            "suggestion": "This trip may require multiple transfers",
            "origin_stops": origin_stops[:3],
            "destination_stops": dest_stops[:3],
        }

    # Build the trip plan
    segments = []

    # Walking segment to transit stop
    origin_stop = best_route["origin_stop"]
    walk_to = await get_walking_directions(
        (origin_lng, origin_lat),
        (origin_stop.get("longitude"), origin_stop.get("latitude")),
    )

    segments.append(
        {
            "type": "walk",
            "from": {
                "name": "Origin",
                "coordinates": [origin_lng, origin_lat],
            },
            "to": {
                "name": origin_stop.get("stop_name"),
                "stop_id": origin_stop.get("stop_id"),
                "coordinates": [
                    origin_stop.get("longitude"),
                    origin_stop.get("latitude"),
                ],
            },
            "distance_meters": (
                walk_to.get("distance_meters")
                if walk_to
                else origin_stop.get("distance_meters")
            ),
            "duration_minutes": (
                walk_to.get("duration_minutes")
                if walk_to
                else round(origin_stop.get("distance_meters", 0) / 80, 1)
            ),
            "geometry": walk_to.get("geometry") if walk_to else None,
        }
    )

    # Transit segment
    route = best_route["route"]
    dest_stop = best_route["dest_stop"]

    # Get intermediate stops
    intermediate = get_intermediate_stops(
        route.get("sample_trip_id"),
        origin_stop.get("stop_id"),
        dest_stop.get("stop_id"),
    )

    segments.append(
        {
            "type": "transit",
            "vehicle_type": route.get("vehicle_type"),
            "route_id": route.get("route_id"),
            "route_short_name": route.get("route_short_name"),
            "route_long_name": route.get("route_long_name"),
            "line": route.get("line"),
            "color": route.get("color"),
            "headsign": route.get("headsign"),
            "from": {
                "name": origin_stop.get("stop_name"),
                "stop_id": origin_stop.get("stop_id"),
                "coordinates": [
                    origin_stop.get("longitude"),
                    origin_stop.get("latitude"),
                ],
            },
            "to": {
                "name": dest_stop.get("stop_name"),
                "stop_id": dest_stop.get("stop_id"),
                "coordinates": [dest_stop.get("longitude"), dest_stop.get("latitude")],
            },
            "stops_count": route.get("stops_count"),
            "stops": intermediate,
        }
    )

    # Walking segment from transit stop
    walk_from = await get_walking_directions(
        (dest_stop.get("longitude"), dest_stop.get("latitude")), (dest_lng, dest_lat)
    )

    segments.append(
        {
            "type": "walk",
            "from": {
                "name": dest_stop.get("stop_name"),
                "stop_id": dest_stop.get("stop_id"),
                "coordinates": [dest_stop.get("longitude"), dest_stop.get("latitude")],
            },
            "to": {
                "name": "Destination",
                "coordinates": [dest_lng, dest_lat],
            },
            "distance_meters": (
                walk_from.get("distance_meters")
                if walk_from
                else dest_stop.get("distance_meters")
            ),
            "duration_minutes": (
                walk_from.get("duration_minutes")
                if walk_from
                else round(dest_stop.get("distance_meters", 0) / 80, 1)
            ),
            "geometry": walk_from.get("geometry") if walk_from else None,
        }
    )

    # Calculate totals
    total_walk = sum(
        s.get("distance_meters", 0) for s in segments if s["type"] == "walk"
    )
    total_walk_time = sum(
        s.get("duration_minutes", 0) for s in segments if s["type"] == "walk"
    )

    return {
        "success": True,
        "origin": {
            "coordinates": [origin_lng, origin_lat],
        },
        "destination": {
            "coordinates": [dest_lng, dest_lat],
        },
        "segments": segments,
        "summary": {
            "total_walking_meters": total_walk,
            "total_walking_minutes": round(total_walk_time, 1),
            "transit_stops": route.get("stops_count"),
            "vehicle_type": route.get("vehicle_type"),
            "route": route.get("route_short_name"),
            "line": route.get("line"),
        },
        "alternative_routes": best_route.get("all_routes", [])[:3],
    }


async def find_transfer_route(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    origin_stops: List[Dict],
    dest_stops: List[Dict],
) -> Optional[Dict]:
    """
    Find a route that requires one transfer (e.g., CTrain to Bus).
    """
    # Strategy: Find CTrain stations near both origin and dest
    # Then find bus connections

    # Get all LRT stops near origin
    lrt_origin_stops = [
        s for s in origin_stops if "CTrain" in s.get("vehicle_types", [])
    ]

    # Get all LRT stops near destination
    lrt_dest_stops = [s for s in dest_stops if "CTrain" in s.get("vehicle_types", [])]

    # If origin has LRT but dest doesn't, try CTrain -> Bus
    if lrt_origin_stops and not lrt_dest_stops:
        # Find LRT stations that have bus connections near destination
        for lrt_stop in lrt_origin_stops:
            lrt_stop_id = lrt_stop.get("stop_id")

            # Find LRT routes from this stop
            lrt_routes = [
                r
                for r in lrt_stop.get("routes", [])
                if r.get("vehicle_type") == "CTrain"
            ]

            if not lrt_routes:
                continue

            # Find all stops this LRT line serves
            for route in lrt_routes:
                route_id = route.get("route_id")
                trips = _gtfs_cache.get("trips_by_route", {}).get(str(route_id), [])

                # Get all stops on this route
                route_stops = set()
                for trip_id in trips[:10]:  # Sample trips
                    trip_stop_times = get_trip_stop_times(trip_id)
                    for st in trip_stop_times:
                        route_stops.add(st.get("stop_id"))

                # Check each LRT stop for bus connections to destination
                for lrt_transfer_stop_id in route_stops:
                    # Find bus stops near this LRT station
                    lrt_transfer_stop = get_stop(lrt_transfer_stop_id)
                    if not lrt_transfer_stop:
                        continue

                    # Find bus routes from near this station
                    nearby_bus_stops = find_nearby_stops(
                        lrt_transfer_stop.get("stop_lat"),
                        lrt_transfer_stop.get("stop_lon"),
                        radius_meters=400,
                        vehicle_type="Bus",
                        limit=5,
                    )

                    for bus_stop in nearby_bus_stops:
                        for dest_stop in dest_stops:
                            # Check if this bus connects to destination
                            bus_routes = find_connecting_routes(
                                bus_stop.get("stop_id"), dest_stop.get("stop_id")
                            )

                            if bus_routes:
                                # Found a transfer route!
                                return await build_transfer_trip(
                                    origin_lng,
                                    origin_lat,
                                    dest_lng,
                                    dest_lat,
                                    lrt_stop,
                                    lrt_transfer_stop_id,
                                    route,
                                    bus_stop,
                                    dest_stop,
                                    bus_routes[0],
                                )

    return None


async def build_transfer_trip(
    origin_lng: float,
    origin_lat: float,
    dest_lng: float,
    dest_lat: float,
    first_transit_stop: Dict,
    transfer_stop_id: str,
    first_route: Dict,
    second_transit_stop: Dict,
    final_stop: Dict,
    second_route: Dict,
) -> Dict:
    """Build a trip plan with one transfer"""

    transfer_stop = get_stop(transfer_stop_id)

    segments = []

    # Walk to first transit
    walk_to = await get_walking_directions(
        (origin_lng, origin_lat),
        (first_transit_stop.get("longitude"), first_transit_stop.get("latitude")),
    )

    segments.append(
        {
            "type": "walk",
            "from": {
                "name": "Origin",
                "coordinates": [origin_lng, origin_lat],
            },
            "to": {
                "name": first_transit_stop.get("stop_name"),
                "stop_id": first_transit_stop.get("stop_id"),
                "coordinates": [
                    first_transit_stop.get("longitude"),
                    first_transit_stop.get("latitude"),
                ],
            },
            "distance_meters": (
                walk_to.get("distance_meters")
                if walk_to
                else first_transit_stop.get("distance_meters", 0)
            ),
            "duration_minutes": (
                walk_to.get("duration_minutes")
                if walk_to
                else round(first_transit_stop.get("distance_meters", 0) / 80, 1)
            ),
            "geometry": walk_to.get("geometry") if walk_to else None,
        }
    )

    # First transit segment (e.g., CTrain)
    segments.append(
        {
            "type": "transit",
            "vehicle_type": first_route.get("vehicle_type"),
            "route_id": first_route.get("route_id"),
            "route_short_name": first_route.get("route_short_name"),
            "line": first_route.get("line"),
            "color": first_route.get("color"),
            "from": {
                "name": first_transit_stop.get("stop_name"),
                "stop_id": first_transit_stop.get("stop_id"),
                "coordinates": [
                    first_transit_stop.get("longitude"),
                    first_transit_stop.get("latitude"),
                ],
            },
            "to": {
                "name": transfer_stop.get("stop_name") if transfer_stop else "Transfer",
                "stop_id": transfer_stop_id,
                "coordinates": (
                    [transfer_stop.get("stop_lon"), transfer_stop.get("stop_lat")]
                    if transfer_stop
                    else None
                ),
            },
        }
    )

    # Walk to second transit (if needed)
    if transfer_stop and second_transit_stop:
        walk_transfer = await get_walking_directions(
            (transfer_stop.get("stop_lon"), transfer_stop.get("stop_lat")),
            (second_transit_stop.get("longitude"), second_transit_stop.get("latitude")),
        )

        if walk_transfer and walk_transfer.get("distance_meters", 0) > 50:
            segments.append(
                {
                    "type": "walk",
                    "from": {
                        "name": transfer_stop.get("stop_name"),
                        "coordinates": [
                            transfer_stop.get("stop_lon"),
                            transfer_stop.get("stop_lat"),
                        ],
                    },
                    "to": {
                        "name": second_transit_stop.get("stop_name"),
                        "stop_id": second_transit_stop.get("stop_id"),
                        "coordinates": [
                            second_transit_stop.get("longitude"),
                            second_transit_stop.get("latitude"),
                        ],
                    },
                    "distance_meters": walk_transfer.get("distance_meters"),
                    "duration_minutes": walk_transfer.get("duration_minutes"),
                    "geometry": walk_transfer.get("geometry"),
                }
            )

    # Second transit segment (e.g., Bus)
    segments.append(
        {
            "type": "transit",
            "vehicle_type": second_route.get("vehicle_type"),
            "route_id": second_route.get("route_id"),
            "route_short_name": second_route.get("route_short_name"),
            "line": second_route.get("line"),
            "color": second_route.get("color"),
            "headsign": second_route.get("headsign"),
            "from": {
                "name": second_transit_stop.get("stop_name"),
                "stop_id": second_transit_stop.get("stop_id"),
                "coordinates": [
                    second_transit_stop.get("longitude"),
                    second_transit_stop.get("latitude"),
                ],
            },
            "to": {
                "name": final_stop.get("stop_name"),
                "stop_id": final_stop.get("stop_id"),
                "coordinates": [
                    final_stop.get("longitude"),
                    final_stop.get("latitude"),
                ],
            },
            "stops_count": second_route.get("stops_count"),
        }
    )

    # Walk from final stop to destination
    walk_from = await get_walking_directions(
        (final_stop.get("longitude"), final_stop.get("latitude")), (dest_lng, dest_lat)
    )

    segments.append(
        {
            "type": "walk",
            "from": {
                "name": final_stop.get("stop_name"),
                "coordinates": [
                    final_stop.get("longitude"),
                    final_stop.get("latitude"),
                ],
            },
            "to": {
                "name": "Destination",
                "coordinates": [dest_lng, dest_lat],
            },
            "distance_meters": (
                walk_from.get("distance_meters")
                if walk_from
                else final_stop.get("distance_meters", 0)
            ),
            "duration_minutes": (
                walk_from.get("duration_minutes")
                if walk_from
                else round(final_stop.get("distance_meters", 0) / 80, 1)
            ),
            "geometry": walk_from.get("geometry") if walk_from else None,
        }
    )

    total_walk = sum(
        s.get("distance_meters", 0) for s in segments if s["type"] == "walk"
    )
    total_walk_time = sum(
        s.get("duration_minutes", 0) for s in segments if s["type"] == "walk"
    )

    return {
        "success": True,
        "has_transfer": True,
        "origin": {
            "coordinates": [origin_lng, origin_lat],
        },
        "destination": {
            "coordinates": [dest_lng, dest_lat],
        },
        "segments": segments,
        "summary": {
            "total_walking_meters": total_walk,
            "total_walking_minutes": round(total_walk_time, 1),
            "transfers": 1,
            "routes": [
                {
                    "vehicle_type": first_route.get("vehicle_type"),
                    "route": first_route.get("route_short_name"),
                    "line": first_route.get("line"),
                },
                {
                    "vehicle_type": second_route.get("vehicle_type"),
                    "route": second_route.get("route_short_name"),
                },
            ],
        },
    }
