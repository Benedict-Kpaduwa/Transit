"""
Trip Planning Service
Provides journey planning using GTFS data and Transit API
"""

import math
import os
import time
from typing import Dict, List, Optional, Tuple

import httpx
from config import settings
from services.gtfs_service import (
    _gtfs_cache,
    get_all_stops,
    get_route,
    get_routes_serving_stop,
    get_stop,
    get_trip,
    get_trip_stop_times,
    get_route_shape_segment,
)
from services.trip_planner import get_ctrain_track_geometry
from services.google_directions import get_google_transit_segment_geometry, get_google_walking_directions, get_google_driving_directions

# Transit API Configuration
TRANSIT_API_BASE_URL = "https://external.transitapp.com/v3/public"


def get_transit_api_key() -> str:
    """Get Transit API key from settings (allows hot reload)"""
    return settings.transit_api_key or ""


async def plan_trip_with_transit_api(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    leave_time: Optional[int] = None,
    arrive_by: Optional[int] = None,
    accessibility: str = "none",
) -> Optional[Dict]:
    """
    Plan a trip using the Transit App API.
    
    This provides professional-grade multimodal trip planning with real-time data.
    
    Args:
        origin_lat: Origin latitude
        origin_lng: Origin longitude  
        dest_lat: Destination latitude
        dest_lng: Destination longitude
        leave_time: Unix timestamp for departure (optional)
        arrive_by: Unix timestamp for desired arrival (optional)
        accessibility: "none", "strict", or "prioritize_step_free"
        
    Returns:
        Trip plan from Transit API, or None if API unavailable/fails
    """
    api_key = get_transit_api_key()
    if not api_key:
        print("⚠️ TRANSIT_API_KEY not configured - falling back to GTFS routing")
        return None
    
    try:
        params = {
            "from_lat": origin_lat,
            "from_lon": origin_lng,
            "to_lat": dest_lat,
            "to_lon": dest_lng,
            "primary_mode": "transit",
            "include_directions": "true",
            "accessibility": accessibility,
        }
        
        if leave_time:
            params["leave_time"] = leave_time
        elif arrive_by:
            params["arrival_time"] = arrive_by
        else:
            # Default to current time
            params["leave_time"] = int(time.time())
        
        headers = {
            "apiKey": api_key,
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{TRANSIT_API_BASE_URL}/plan",
                params=params,
                headers=headers,
            )
            
            if response.status_code == 200:
                data = response.json()
                return await transform_transit_api_response(data, origin_lat, origin_lng, dest_lat, dest_lng)
            elif response.status_code == 401:
                print("❌ Transit API: Invalid API key")
                return None
            elif response.status_code == 429:
                print("⚠️ Transit API: Rate limit exceeded")
                return None
            else:
                print(f"⚠️ Transit API error: {response.status_code} - {response.text[:200]}")
                return None
                
    except httpx.TimeoutException:
        print("⚠️ Transit API timeout")
        return None
    except Exception as e:
        print(f"⚠️ Transit API error: {str(e)}")
        return None


def _fmt_duration(seconds: float) -> str:
    """Format a duration in seconds as e.g. '1h 33min' or '12 min'."""
    total_mins = max(0, round(seconds / 60))
    if total_mins >= 60:
        hours, mins = divmod(total_mins, 60)
        return f"{hours}h {mins}min" if mins else f"{hours}h"
    return f"{total_mins} min"


def _fmt_distance(meters: float) -> str:
    """Format a distance in metres as e.g. '650 m' or '1.2 km'."""
    if meters >= 1000:
        return f"{meters / 1000:.1f} km"
    return f"{int(round(meters))} m"


def _clean_fare(fare: Optional[Dict]) -> str:
    """Pull a plain fare string out of a Transit API fare object."""
    if not fare:
        return ""
    text = (fare.get("low_price", {}) or {}).get("text", "") or ""
    # Transit API separates symbol and value with exotic spaces (U+202F / U+00A0)
    for ch in ("\u202f", "\xa0", "\u2009", "\u2007"):
        text = text.replace(ch, " ")
    return text.strip()


def _vehicle_meta(route_short_name: str, route_long_name: str, route_color: str) -> Tuple[str, Optional[str], str]:
    """Return (vehicle_type, line, color) for a transit route."""
    name = (route_short_name or "").lower()
    long_lower = (route_long_name or "").lower()
    if route_short_name in ("201", "Red") or "red line" in long_lower:
        return "CTrain", "Red Line", "#DC143C"
    if route_short_name in ("202", "Blue") or "blue line" in long_lower:
        return "CTrain", "Blue Line", "#0088FF"
    if name in ("red", "blue"):
        return "CTrain", f"{route_short_name.capitalize()} Line", ("#DC143C" if name == "red" else "#0088FF")
    color = f"#{route_color}" if route_color else "#22c55e"
    return "Bus", None, color


def _polyline_length_m(coords: List[List[float]]) -> float:
    """Total ground length of a [lon, lat] polyline, in metres."""
    return sum(
        haversine_distance(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0])
        for i in range(len(coords) - 1)
    )


def _shape_within_detour(
    coords: List[List[float]],
    from_coords: List[float],
    to_coords: List[float],
    factor: float,
    slack_m: float,
) -> bool:
    """
    A sliced route shape is only trustworthy if it runs roughly stop-to-stop.
    GTFS shape slicing on Calgary's many loop routes frequently returns most of
    the loop; reject anything that rides far further than the crow-flies gap.
    """
    if len(coords) < 2:
        return False
    straight = haversine_distance(
        from_coords[1], from_coords[0], to_coords[1], to_coords[0]
    )
    return _polyline_length_m(coords) <= max(straight * factor, straight + slack_m)


async def _build_transit_geometry(
    vehicle_type: str,
    route_short_name: str,
    line: Optional[str],
    from_coords: List[float],
    to_coords: List[float],
) -> Dict:
    """
    Build a road/rail-following LineString for a transit leg between two real
    stop coordinates:

    * CTrain  -> GTFS rail shape (201/202), else the cached track alignment.
    * Bus     -> GTFS route shape sliced to the ridden span *if it passes a
                 detour sanity check*, otherwise Mapbox driving between the two
                 stops (always road-following and sane), then a straight line.

    Endpoints are pinned so consecutive legs join seamlessly.
    """
    start_lon, start_lat = from_coords
    end_lon, end_lat = to_coords
    have_coords = None not in (start_lat, start_lon, end_lat, end_lon)
    geometry: Optional[Dict] = None

    shape_lookup = route_short_name
    if vehicle_type == "CTrain" and line:
        shape_lookup = "201" if "Red" in line else "202"

    if shape_lookup and have_coords:
        try:
            gtfs_shape = get_route_shape_segment(
                shape_lookup, start_lat, start_lon, end_lat, end_lon
            )
            coords = (gtfs_shape or {}).get("coordinates", [])
            # CTrain shapes track a straight-ish alignment; buses need a stricter
            # guard because loop-route slices balloon to 4-5x the direct gap.
            factor = 3.0 if vehicle_type == "CTrain" else 1.9
            if coords and _shape_within_detour(
                coords, from_coords, to_coords, factor, 500
            ):
                geometry = gtfs_shape
        except Exception as e:
            print(f"⚠️ GTFS shape lookup failed for {shape_lookup}: {e}")

    if geometry is None and vehicle_type == "CTrain" and line and have_coords:
        rail = get_ctrain_track_geometry(
            (start_lon, start_lat), (end_lon, end_lat), line
        )
        if rail and len(rail.get("coordinates", [])) >= 2:
            geometry = rail

    if geometry is None and vehicle_type != "CTrain" and have_coords:
        driving = await get_driving_directions(
            (start_lon, start_lat), (end_lon, end_lat)
        )
        if driving and driving.get("geometry", {}).get("coordinates"):
            geometry = driving["geometry"]

    if geometry is None:
        geometry = {
            "type": "LineString",
            "coordinates": [list(from_coords), list(to_coords)],
        }

    coords = geometry.get("coordinates") or []
    if len(coords) >= 2:
        coords[0] = list(from_coords)
        coords[-1] = list(to_coords)
        geometry["coordinates"] = coords
    return geometry


def _build_mode_chips(segments: List[Dict]) -> List[Dict]:
    """Compact per-leg summary for the route list UI (walk 9 › 46 › 115 …)."""
    chips = []
    for seg in segments:
        minutes = max(1, round(seg.get("duration", 0) / 60))
        if seg["type"] == "walk":
            chips.append({"type": "walk", "minutes": minutes})
        else:
            is_train = seg.get("vehicle_type") == "CTrain"
            chips.append(
                {
                    "type": "train" if is_train else "bus",
                    "label": seg.get("route_short_name") or seg.get("line") or "?",
                    "color": seg.get("color"),
                    "minutes": minutes,
                }
            )
    return chips


async def _transform_result(
    result: Dict,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    index: int,
) -> Optional[Dict]:
    """Transform a single Transit API itinerary into our internal route shape."""
    segments: List[Dict] = []
    total_walking_distance = 0.0
    transit_lines: List[str] = []

    raw_legs = result.get("legs", [])

    # Pass 1: decode every leg's polyline. Only walk legs carry one; transit legs
    # never do, and the Transit API's stop ids don't map to our GTFS ids — so the
    # real boarding/alighting points come from the walk legs that bracket a ride.
    decoded: List[List[List[float]]] = []
    for leg in raw_legs:
        coords: List[List[float]] = []
        if leg.get("polyline"):
            try:
                import polyline

                coords = [[lon, lat] for lat, lon in polyline.decode(leg["polyline"])]
            except Exception:
                coords = []
        decoded.append(coords)

    def _walk_end_before(i: int) -> Optional[List[float]]:
        for j in range(i - 1, -1, -1):
            if raw_legs[j].get("leg_mode", "").lower() == "walk" and decoded[j]:
                return decoded[j][-1]
        return None

    def _walk_start_after(i: int) -> Optional[List[float]]:
        for j in range(i + 1, len(raw_legs)):
            if raw_legs[j].get("leg_mode", "").lower() == "walk" and decoded[j]:
                return decoded[j][0]
        return None

    last_coords = [origin_lng, origin_lat]

    for leg_index, leg in enumerate(raw_legs):
        leg_mode = leg.get("leg_mode", "").lower()
        leg_coords = decoded[leg_index]

        if leg_mode == "walk":
            distance = leg.get("distance", 0) or 0
            total_walking_distance += distance
            from_coords = leg_coords[0] if leg_coords else last_coords
            to_coords = leg_coords[-1] if leg_coords else [dest_lng, dest_lat]
            walk_geometry = (
                {"type": "LineString", "coordinates": leg_coords}
                if len(leg_coords) > 1
                else {"type": "LineString", "coordinates": [from_coords, to_coords]}
            )
            segments.append(
                {
                    "type": "walk",
                    "instruction": "Walk",
                    "from": {
                        "name": "Start" if leg_index == 0 else "Transfer",
                        "coordinates": from_coords,
                    },
                    "to": {"name": "Stop", "coordinates": to_coords},
                    "distance": int(distance),
                    "duration": leg.get("duration", 0),
                    "departure_time": leg.get("start_time"),
                    "arrival_time": leg.get("end_time"),
                    "geometry": walk_geometry,
                }
            )
            last_coords = to_coords
            continue

        if leg_mode != "transit":
            continue

        route_info = (leg.get("routes") or [{}])[0]
        route_short_name = route_info.get("route_short_name", "?")
        route_long_name = route_info.get("route_long_name", "") or ""
        headsign = route_info.get("headsign") or (
            route_long_name.split("/")[0].strip() if route_long_name else ""
        )
        vehicle_type, line, color = _vehicle_meta(
            route_short_name, route_long_name, route_info.get("route_color", "")
        )
        transit_lines.append(route_short_name)

        departure = (leg.get("departures") or [{}])[0]
        plan_details = departure.get("plan_details", {})
        route_id = plan_details.get("global_route_id", "")
        stop_items = plan_details.get("stop_schedule_items", []) or []

        from_coords = _walk_end_before(leg_index) or last_coords
        to_coords = _walk_start_after(leg_index) or [dest_lng, dest_lat]

        geometry = await _build_transit_geometry(
            vehicle_type, route_short_name, line, from_coords, to_coords
        )

        if vehicle_type == "CTrain":
            instruction = f"Take {route_short_name} Line towards {headsign}" if headsign else f"Take {route_short_name} Line"
        else:
            instruction = f"Take Route {route_short_name} towards {headsign}" if headsign else f"Take Route {route_short_name}"

        num_stops = max(1, len(stop_items) - 1) if stop_items else max(1, round(leg.get("duration", 0) / 150))
        segments.append(
            {
                "type": "transit",
                "instruction": instruction,
                "vehicle_type": vehicle_type,
                "route_id": route_id,
                "route_short_name": route_short_name,
                "route_long_name": route_long_name,
                "line": line,
                "headsign": headsign,
                "color": color,
                "from": {
                    "name": "Departure stop",
                    "stop_id": stop_items[0].get("global_stop_id") if stop_items else None,
                    "coordinates": from_coords,
                },
                "to": {
                    "name": "Arrival stop",
                    "stop_id": stop_items[-1].get("global_stop_id") if len(stop_items) > 1 else None,
                    "coordinates": to_coords,
                },
                "num_stops": num_stops,
                "stops_count": num_stops,
                "stops": [],
                "duration": leg.get("duration", 0),
                "departure_time": leg.get("start_time") or departure.get("departure_time"),
                "arrival_time": leg.get("end_time") or departure.get("arrival_time"),
                "geometry": geometry,
            }
        )
        last_coords = to_coords

    if not any(s["type"] == "transit" for s in segments):
        return None

    # Snap walk legs onto the transit stops on either side so nothing jumps.
    for i, seg in enumerate(segments):
        if seg["type"] != "walk":
            continue
        if i > 0:
            anchor = segments[i - 1]["to"]["coordinates"]
            seg["from"]["coordinates"] = anchor
            if seg["geometry"]["coordinates"]:
                seg["geometry"]["coordinates"][0] = anchor
        if i < len(segments) - 1:
            anchor = segments[i + 1]["from"]["coordinates"]
            seg["to"]["coordinates"] = anchor
            if seg["geometry"]["coordinates"]:
                seg["geometry"]["coordinates"][-1] = anchor

    total_duration = result.get("duration", 0) or sum(s.get("duration", 0) for s in segments)
    transit_segments = [s for s in segments if s["type"] == "transit"]
    depart_at = segments[0].get("departure_time") if segments else result.get("start_time")
    arrive_at = segments[-1].get("arrival_time") if segments else result.get("end_time")

    return {
        "id": f"transit-{index}",
        "segments": segments,
        "mode_chips": _build_mode_chips(segments),
        "summary": {
            "total_duration": total_duration,
            "total_duration_text": _fmt_duration(total_duration),
            "total_walking_distance": int(total_walking_distance),
            "total_walking_distance_text": _fmt_distance(total_walking_distance),
            "transit_line": ", ".join(transit_lines) if transit_lines else "N/A",
            "transit_type": transit_segments[0].get("vehicle_type") if transit_segments else "Transit",
            "num_transfers": max(0, len(transit_segments) - 1),
            "fare": _clean_fare(result.get("fare")),
            "depart_at": depart_at,
            "arrive_at": arrive_at,
            "accessibility": result.get("accessibility"),
        },
    }


async def transform_transit_api_response(
    api_response: Dict,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
) -> Dict:
    """Transform a Transit API v3 /plan response into our multi-route format."""
    results = api_response.get("results", [])
    if not results:
        return {
            "success": False,
            "error": "No routes found",
            "suggestion": "Try adjusting your departure time or location",
        }

    routes: List[Dict] = []
    for index, result in enumerate(results[:4]):
        try:
            route = await _transform_result(
                result, origin_lat, origin_lng, dest_lat, dest_lng, index
            )
        except Exception as e:
            print(f"⚠️ Failed to transform itinerary {index}: {e}")
            route = None
        if route:
            routes.append(route)

    if not routes:
        return {
            "success": False,
            "error": "No usable transit route found",
            "suggestion": "Try adjusting your departure time or location",
        }

    primary = routes[0]
    return {
        "success": True,
        "source": "transit_api",
        "origin": {"coordinates": [origin_lng, origin_lat]},
        "destination": {"coordinates": [dest_lng, dest_lat]},
        "routes": routes,
        # Back-compat: callers that expect a single plan read these.
        "segments": primary["segments"],
        "summary": primary["summary"],
    }


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
    include_paired_platforms: bool = False,
) -> List[Dict]:
    """Find stops within radius of a location

    Args:
        include_paired_platforms: If True, for CTrain stations also include
            the opposite directional platform (NB<->SB, EB<->WB)
    """
    all_stops = get_all_stops()

    nearby = []
    found_stop_ids = set()

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

            stop_entry = {
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
            nearby.append(stop_entry)
            found_stop_ids.add(stop.get("stop_id"))

    # If include_paired_platforms, find opposite direction platforms for CTrain stations
    if include_paired_platforms:
        paired_stops = find_paired_ctrain_platforms(nearby, found_stop_ids)
        nearby.extend(paired_stops)

    # Sort by distance and limit
    nearby.sort(key=lambda x: x["distance_meters"])
    return nearby[:limit]


def find_paired_ctrain_platforms(
    stops: List[Dict], found_stop_ids: set
) -> List[Dict]:
    """Find opposite direction platforms for CTrain stations

    For each CTrain station found (e.g., 'WB 4 Street SW Station'),
    find the opposite platform (e.g., 'EB 4 Street SW Station')
    """
    paired_stops = []
    all_stops = get_all_stops()

    direction_pairs = {
        "NB ": "SB ",
        "SB ": "NB ",
        "EB ": "WB ",
        "WB ": "EB ",
    }

    for stop in stops:
        stop_name = stop.get("stop_name", "")

        # Check if this is a CTrain station
        if "CTrain" not in stop.get("vehicle_types", []):
            continue

        # Check if name starts with directional prefix
        for prefix, opposite_prefix in direction_pairs.items():
            if stop_name.startswith(prefix):
                # Look for the opposite platform
                opposite_name = opposite_prefix + stop_name[len(prefix):]

                for other_stop in all_stops:
                    other_name = other_stop.get("stop_name", "")
                    other_id = other_stop.get("stop_id")

                    if other_name == opposite_name and other_id not in found_stop_ids:
                        # Found the paired platform
                        routes = get_routes_serving_stop(other_id)
                        stop_vehicle_types = set(r.get("vehicle_type") for r in routes)

                        # Calculate distance (use same as original stop + small penalty)
                        paired_distance = stop.get("distance_meters", 0) + 50

                        paired_stops.append({
                            "stop_id": other_id,
                            "stop_code": other_stop.get("stop_code"),
                            "stop_name": other_name,
                            "latitude": other_stop.get("stop_lat"),
                            "longitude": other_stop.get("stop_lon"),
                            "distance_meters": paired_distance,
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
                            "is_paired_platform": True,
                        })
                        found_stop_ids.add(other_id)
                break

    return paired_stops


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
                "place_name": feature.get("place_name"),
                "coordinates": feature["geometry"]["coordinates"],  # [lng, lat] array
                "type": feature.get("place_type", ["unknown"])[0],
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


async def get_driving_directions(
    origin: Tuple[float, float],
    destination: Tuple[float, float],
) -> Optional[Dict]:
    """
    Get driving directions between two points (for bus routes)

    Args:
        origin: (longitude, latitude) of start
        destination: (longitude, latitude) of end

    Returns:
        Driving route with geometry and duration
    """
    if not settings.mapbox_access_token:
        return None

    url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{origin[0]},{origin[1]};{destination[0]},{destination[1]}"

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
                "geometry": route["geometry"],
            }
    except Exception as e:
        print(f"Error getting driving directions: {e}")

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

        for st in trip_stop_times:
            if st.get("stop_id") == str(origin_stop_id):
                origin_seq = st.get("stop_sequence")
            if st.get("stop_id") == str(destination_stop_id):
                dest_seq = st.get("stop_sequence")

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


def _ensure_multi_route_shape(result: Dict) -> Dict:
    """
    Guarantee a successful trip plan carries a `routes` array so every caller
    (and the frontend) can treat single- and multi-route responses the same way.
    The GTFS fallback only ever produces one itinerary.
    """
    if not result or not result.get("success"):
        return result
    if result.get("routes"):
        return result

    segments = result.get("segments", []) or []
    summary = result.get("summary", {}) or {}
    result["routes"] = [
        {
            "id": "gtfs-0",
            "segments": segments,
            "mode_chips": _build_mode_chips(segments),
            "summary": summary,
        }
    ]
    return result


async def plan_trip(
    origin: Tuple[float, float],
    destination: Tuple[float, float],
    prefer_lrt: bool = True,
    leave_time: Optional[int] = None,
    arrive_by: Optional[int] = None,
    accessibility: str = "none",
) -> Dict:
    """Plan a transit trip, always returning a `routes` array on success."""
    result = await _plan_trip_impl(
        origin, destination, prefer_lrt, leave_time, arrive_by, accessibility
    )
    return _ensure_multi_route_shape(result)


async def _plan_trip_impl(
    origin: Tuple[float, float],
    destination: Tuple[float, float],
    prefer_lrt: bool = True,
    leave_time: Optional[int] = None,
    arrive_by: Optional[int] = None,
    accessibility: str = "none",
) -> Dict:
    """
    Plan a transit trip from origin to destination.

    Uses Transit API for professional-grade routing if API key is configured,
    falls back to GTFS-based routing otherwise.

    Args:
        origin: (longitude, latitude) of start
        destination: (longitude, latitude) of end
        prefer_lrt: Whether to prefer CTrain routes (GTFS fallback only)
        leave_time: Unix timestamp for departure (Transit API only)
        arrive_by: Unix timestamp for arrival (Transit API only)
        accessibility: "none", "strict", or "prioritize_step_free" (Transit API only)

    Returns:
        Trip plan with walking and transit segments
    """
    origin_lng, origin_lat = origin
    dest_lng, dest_lat = destination

    # Try Transit API first (if configured)
    if get_transit_api_key():
        transit_result = await plan_trip_with_transit_api(
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            dest_lat=dest_lat,
            dest_lng=dest_lng,
            leave_time=leave_time,
            arrive_by=arrive_by,
            accessibility=accessibility,
        )
        
        if transit_result and transit_result.get("success"):
            return transit_result
        
        # If Transit API failed but returned an error, still try GTFS fallback
        print("📍 Transit API didn't return route, trying GTFS fallback...")

    # Fallback to GTFS-based routing

    # Find nearby stops at origin and destination
    # include_paired_platforms ensures we get both directional CTrain platforms
    origin_stops = find_nearby_stops(
        origin_lat,
        origin_lng,
        radius_meters=1500,
        limit=20,  # Increased limit to include paired platforms
        include_paired_platforms=True,
    )

    dest_stops = find_nearby_stops(
        dest_lat,
        dest_lng,
        radius_meters=1500,
        limit=20,  # Increased limit to include paired platforms
        include_paired_platforms=True,
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
    # Increased from 5 to 10 to better handle directional platforms
    for origin_stop in origin_stops[:10]:
        for dest_stop in dest_stops[:10]:
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

    walk_to_distance = (
        walk_to.get("distance_meters")
        if walk_to
        else origin_stop.get("distance_meters", 0)
    )
    walk_to_duration_sec = (
        walk_to.get("duration_seconds")
        if walk_to
        else round(origin_stop.get("distance_meters", 0) / 1.4)  # ~1.4 m/s walking
    )

    segments.append(
        {
            "type": "walk",
            "instruction": f"Walk to {origin_stop.get('stop_name')}",
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
            "distance": walk_to_distance,
            "duration": walk_to_duration_sec,
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

    # Estimate transit duration: ~2 min per stop for CTrain, ~3 min for bus
    stops_count = route.get("stops_count", 1)
    transit_duration_sec = stops_count * (120 if route.get("vehicle_type") == "CTrain" else 180)

    vehicle_type = route.get("vehicle_type", "Transit")
    line_name = route.get("line") or route.get("route_short_name", "")
    headsign = route.get("headsign", "")

    if vehicle_type == "CTrain":
        instruction = f"Take {line_name} towards {headsign}" if headsign else f"Take {line_name}"
    else:
        instruction = f"Take Route {route.get('route_short_name')} towards {headsign}" if headsign else f"Take Route {route.get('route_short_name')}"

    # Build transit segment with geometry
    transit_segment = {
        "type": "transit",
        "instruction": instruction,
        "vehicle_type": vehicle_type,
        "route_id": route.get("route_id"),
        "route_short_name": route.get("route_short_name"),
        "route_long_name": route.get("route_long_name"),
        "line": route.get("line"),
        "color": route.get("color"),
        "headsign": headsign,
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
        "num_stops": stops_count,
        "duration": transit_duration_sec,
        "stops": intermediate,
    }
    
    # Add accurate route geometry from GTFS shapes
    route_short = route.get("route_short_name", "")
    origin_lat = origin_stop.get("latitude")
    origin_lon = origin_stop.get("longitude")
    dest_lat = dest_stop.get("latitude")
    dest_lon = dest_stop.get("longitude")
    
    if route_short and origin_lat and origin_lon and dest_lat and dest_lon:
        gtfs_shape = get_route_shape_segment(
            route_short, origin_lat, origin_lon, dest_lat, dest_lon
        )
        if gtfs_shape:
            transit_segment["geometry"] = gtfs_shape
    
    # Fallback for CTrain if GTFS shape not found
    if not transit_segment.get("geometry") and vehicle_type == "CTrain" and line_name:
        ctrain_from_coords = (origin_lon, origin_lat)
        ctrain_to_coords = (dest_lon, dest_lat)
        ctrain_geometry = get_ctrain_track_geometry(ctrain_from_coords, ctrain_to_coords, line_name)
        if ctrain_geometry:
            transit_segment["geometry"] = ctrain_geometry
    
    segments.append(transit_segment)

    # Walking segment from transit stop
    walk_from = await get_walking_directions(
        (dest_stop.get("longitude"), dest_stop.get("latitude")), (dest_lng, dest_lat)
    )

    walk_from_distance = (
        walk_from.get("distance_meters")
        if walk_from
        else dest_stop.get("distance_meters", 0)
    )
    walk_from_duration_sec = (
        walk_from.get("duration_seconds")
        if walk_from
        else round(dest_stop.get("distance_meters", 0) / 1.4)
    )

    segments.append(
        {
            "type": "walk",
            "instruction": "Walk to destination",
            "from": {
                "name": dest_stop.get("stop_name"),
                "stop_id": dest_stop.get("stop_id"),
                "coordinates": [dest_stop.get("longitude"), dest_stop.get("latitude")],
            },
            "to": {
                "name": "Destination",
                "coordinates": [dest_lng, dest_lat],
            },
            "distance": walk_from_distance,
            "duration": walk_from_duration_sec,
            "geometry": walk_from.get("geometry") if walk_from else None,
        }
    )

    # Calculate totals
    total_walk_distance = sum(
        s.get("distance", 0) for s in segments if s["type"] == "walk"
    )
    total_duration_sec = sum(
        s.get("duration", 0) for s in segments
    )

    # Format duration text
    total_mins = round(total_duration_sec / 60)
    if total_mins >= 60:
        hours = total_mins // 60
        mins = total_mins % 60
        duration_text = f"{hours}h {mins}min" if mins else f"{hours}h"
    else:
        duration_text = f"{total_mins} min"

    # Format walking distance text
    if total_walk_distance >= 1000:
        walk_text = f"{total_walk_distance / 1000:.1f} km"
    else:
        walk_text = f"{round(total_walk_distance)} m"

    vehicle_type = route.get("vehicle_type", "Transit")
    line_name = route.get("line") or route.get("route_short_name", "")

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
            "total_duration": total_duration_sec,
            "total_duration_text": duration_text,
            "total_walking_distance": total_walk_distance,
            "total_walking_distance_text": walk_text,
            "transit_line": line_name,
            "transit_type": vehicle_type,
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

    # If dest has LRT but origin doesn't, try Bus -> CTrain
    # This handles cases like going from a residential area to downtown
    if lrt_dest_stops and not lrt_origin_stops:
        bus_origin_stops = [
            s for s in origin_stops if "Bus" in s.get("vehicle_types", [])
        ]
        
        for dest_lrt_stop in lrt_dest_stops:
            # Get CTrain routes at destination
            lrt_routes = [
                r
                for r in dest_lrt_stop.get("routes", [])
                if r.get("vehicle_type") == "CTrain"
            ]
            
            if not lrt_routes:
                continue
            
            # For each CTrain route, find stations that have bus connections from origin
            for lrt_route in lrt_routes:
                route_id = lrt_route.get("route_id")
                trips = _gtfs_cache.get("trips_by_route", {}).get(str(route_id), [])
                
                # Get all CTrain stops on this line
                ctrain_stops_on_route = set()
                for trip_id in trips[:10]:
                    trip_stop_times = get_trip_stop_times(trip_id)
                    for st in trip_stop_times:
                        ctrain_stops_on_route.add(st.get("stop_id"))
                
                # For each CTrain station, check if there's a bus from origin
                for ctrain_station_id in ctrain_stops_on_route:
                    ctrain_station = get_stop(ctrain_station_id)
                    if not ctrain_station:
                        continue
                    
                    # Find bus stops near this CTrain station
                    nearby_bus_stops = find_nearby_stops(
                        ctrain_station.get("stop_lat"),
                        ctrain_station.get("stop_lon"),
                        radius_meters=500,
                        vehicle_type="Bus",
                        limit=10,
                    )
                    
                    # Check if any origin bus stop connects to a bus stop near this CTrain station
                    for origin_bus_stop in bus_origin_stops:
                        for transfer_bus_stop in nearby_bus_stops:
                            # Check if there's a bus route connecting origin to this transfer point
                            bus_routes = find_connecting_routes(
                                origin_bus_stop.get("stop_id"),
                                transfer_bus_stop.get("stop_id")
                            )
                            
                            if bus_routes:
                                # Check if CTrain connects from transfer to destination
                                ctrain_routes = find_connecting_routes(
                                    ctrain_station_id,
                                    dest_lrt_stop.get("stop_id")
                                )
                                
                                if ctrain_routes:
                                    # Found a Bus -> CTrain transfer route!
                                    return await build_transfer_trip(
                                        origin_lng,
                                        origin_lat,
                                        dest_lng,
                                        dest_lat,
                                        origin_bus_stop,        # First transit stop (bus)
                                        transfer_bus_stop.get("stop_id"),  # Transfer point
                                        bus_routes[0],          # Bus route
                                        ctrain_station,         # CTrain station dict
                                        dest_lrt_stop,          # Final LRT stop
                                        ctrain_routes[0],       # CTrain route
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
    first_segment = {
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
    
    # Add geometry for CTrain routes
    if first_route.get("vehicle_type") == "CTrain" and first_route.get("line"):
        from_coords = (first_transit_stop.get("longitude"), first_transit_stop.get("latitude"))
        to_coords = (transfer_stop.get("stop_lon"), transfer_stop.get("stop_lat")) if transfer_stop else None
        if from_coords and to_coords:
            ctrain_geometry = get_ctrain_track_geometry(from_coords, to_coords, first_route.get("line"))
            if ctrain_geometry:
                first_segment["geometry"] = ctrain_geometry
    
    segments.append(first_segment)

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

    # Second transit segment (e.g., Bus or CTrain)
    second_segment = {
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
    
    # Add geometry for CTrain routes
    if second_route.get("vehicle_type") == "CTrain" and second_route.get("line"):
        from_coords = (second_transit_stop.get("longitude"), second_transit_stop.get("latitude"))
        to_coords = (final_stop.get("longitude"), final_stop.get("latitude"))
        if from_coords and to_coords:
            ctrain_geometry = get_ctrain_track_geometry(from_coords, to_coords, second_route.get("line"))
            if ctrain_geometry:
                second_segment["geometry"] = ctrain_geometry
    
    segments.append(second_segment)

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
