"""
CTrain Position Interpolation Service

Since Calgary Transit doesn't publish CTrain GPS positions in their GTFS-RT feed,
this module estimates train positions by interpolating between stations based on
trip updates (arrival predictions) and track geometry.
"""

import asyncio
import math
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from services.gtfs_service import (
    _gtfs_cache,
    _realtime_cache,
    get_stop,
    refresh_realtime_data,
)
from services.calgary_transit import get_lrt_tracks_from_gtfs


async def get_interpolated_ctrain_positions(line: Optional[str] = None) -> List[Dict]:
    """
    Calculate estimated CTrain positions from trip update data.
    
    Algorithm:
    1. Get all CTrain trip updates (route 201/202)
    2. For each trip, find the last departed station and next arrival
    3. Calculate progress between stations based on current time
    4. Interpolate position along track geometry
    5. Calculate bearing from track direction
    
    Args:
        line: Optional filter - "Red" or "Blue"
        
    Returns:
        List of estimated vehicle positions
    """
    await refresh_realtime_data()
    
    # Get track geometry for interpolation
    track_data = await get_lrt_tracks_from_gtfs(None)
    
    # Extract track coordinates by line
    red_track_coords = []
    blue_track_coords = []
    for feature in track_data.features:
        if feature.geometry.type == "LineString":
            line_name = feature.properties.get("line", "")
            coords = feature.geometry.coordinates
            if line_name == "RED":
                red_track_coords.extend(coords)
            elif line_name == "BLUE":
                blue_track_coords.extend(coords)
    
    # Get CTrain trip updates
    trip_updates = _realtime_cache.get("trip_updates", [])
    ctrain_trips = [
        tu for tu in trip_updates 
        if tu.get("route_id") in ["201", "202"]
    ]
    
    print(f"🚃 Found {len(ctrain_trips)} CTrain trips for interpolation")
    
    now = datetime.now()
    current_time = now.timestamp()
    
    interpolated_vehicles = []
    
    for trip in ctrain_trips:
        trip_id = trip.get("trip_id")
        route_id = trip.get("route_id")
        headsign = trip.get("headsign")
        vehicle_id = trip.get("vehicle_id")
        stop_updates = trip.get("stop_time_updates", [])
        
        if len(stop_updates) < 2:
            continue
        
        # Find where the train is: between which two stops?
        prev_stop = None
        next_stop = None
        
        for i, stu in enumerate(stop_updates):
            arr_info = stu.get("arrival") or stu.get("departure")
            if not arr_info or not arr_info.get("time"):
                continue
                
            arr_time = arr_info.get("time")
            
            if arr_time > current_time:
                # This is the next stop (hasn't arrived yet)
                next_stop = stu
                next_stop["arrival_time"] = arr_time
                # Previous stop is the one before
                if i > 0:
                    prev_stu = stop_updates[i - 1]
                    prev_arr = prev_stu.get("departure") or prev_stu.get("arrival")
                    if prev_arr and prev_arr.get("time"):
                        prev_stop = prev_stu
                        prev_stop["departure_time"] = prev_arr.get("time")
                break
        
        if not prev_stop or not next_stop:
            # Train hasn't departed yet or already at final station
            # Use first stop with future arrival
            for stu in stop_updates:
                arr_info = stu.get("arrival") or stu.get("departure")
                if arr_info and arr_info.get("time") and arr_info.get("time") > current_time:
                    # Train is approaching this stop, place it before
                    stop_info = get_stop(stu.get("stop_id"))
                    if stop_info:
                        position = {
                            "vehicle_id": vehicle_id or f"trip_{trip_id}",
                            "trip_id": trip_id,
                            "route_id": route_id,
                            "route_short_name": route_id,
                            "vehicle_type": "CTrain",
                            "line": "Red" if route_id == "201" else "Blue",
                            "color": "#DC143C" if route_id == "201" else "#0088FF",
                            "headsign": headsign,
                            "position": {
                                "latitude": stop_info["stop_lat"],
                                "longitude": stop_info["stop_lon"],
                                "bearing": None,
                                "speed": None,
                            },
                            "next_stop": stu.get("stop_name") or stop_info.get("stop_name"),
                            "interpolated": True,
                            "timestamp": int(current_time),
                        }
                        interpolated_vehicles.append(position)
                    break
            continue
        
        # Calculate progress between prev_stop and next_stop
        prev_time = prev_stop.get("departure_time")
        next_time = next_stop.get("arrival_time")
        
        if prev_time and next_time and next_time > prev_time:
            total_duration = next_time - prev_time
            elapsed = current_time - prev_time
            progress = min(1.0, max(0.0, elapsed / total_duration))
        else:
            progress = 0.5  # Default to midpoint
        
        # Get stop coordinates
        prev_stop_info = get_stop(prev_stop.get("stop_id"))
        next_stop_info = get_stop(next_stop.get("stop_id"))
        
        if not prev_stop_info or not next_stop_info:
            continue
        
        prev_coords = (prev_stop_info["stop_lon"], prev_stop_info["stop_lat"])
        next_coords = (next_stop_info["stop_lon"], next_stop_info["stop_lat"])
        
        # Interpolate position along track (or straight line if track matching fails)
        track_coords = red_track_coords if route_id == "201" else blue_track_coords
        
        interpolated_pos = interpolate_on_track(
            prev_coords, next_coords, progress, track_coords
        )
        
        # Calculate bearing
        bearing = calculate_bearing(
            prev_coords[1], prev_coords[0],
            next_coords[1], next_coords[0]
        )
        
        position = {
            "vehicle_id": vehicle_id or f"trip_{trip_id}",
            "trip_id": trip_id,
            "route_id": route_id,
            "route_short_name": route_id,
            "vehicle_type": "CTrain",
            "line": "Red" if route_id == "201" else "Blue",
            "color": "#DC143C" if route_id == "201" else "#0088FF",
            "headsign": headsign,
            "position": {
                "latitude": interpolated_pos[1],
                "longitude": interpolated_pos[0],
                "bearing": bearing,
                "speed": None,  # Can't estimate speed reliably
            },
            "prev_stop": prev_stop.get("stop_name") or prev_stop_info.get("stop_name"),
            "next_stop": next_stop.get("stop_name") or next_stop_info.get("stop_name"),
            "progress": round(progress * 100, 1),
            "interpolated": True,
            "timestamp": int(current_time),
        }
        
        interpolated_vehicles.append(position)
    
    # Filter by line if specified
    if line:
        line_lower = line.lower()
        interpolated_vehicles = [
            v for v in interpolated_vehicles
            if v.get("line", "").lower() == line_lower
        ]
    
    print(f"✅ Interpolated {len(interpolated_vehicles)} CTrain positions")
    
    return interpolated_vehicles


def interpolate_on_track(
    from_coords: Tuple[float, float],
    to_coords: Tuple[float, float],
    progress: float,
    track_coords: List[List[float]]
) -> Tuple[float, float]:
    """
    Interpolate position along track geometry.
    
    Args:
        from_coords: (lon, lat) of start station
        to_coords: (lon, lat) of end station  
        progress: 0.0-1.0 progress between stations
        track_coords: List of [lon, lat] points on track
        
    Returns:
        (lon, lat) of interpolated position
    """
    if not track_coords or len(track_coords) < 2:
        # Fallback to straight line interpolation
        return linear_interpolate(from_coords, to_coords, progress)
    
    # Find track segment between stations
    from_idx = find_closest_track_point(from_coords, track_coords)
    to_idx = find_closest_track_point(to_coords, track_coords)
    
    if from_idx == to_idx:
        return linear_interpolate(from_coords, to_coords, progress)
    
    # Ensure from_idx < to_idx
    if from_idx > to_idx:
        from_idx, to_idx = to_idx, from_idx
        progress = 1.0 - progress  # Reverse progress if going backwards
    
    # Get track segment
    segment = track_coords[from_idx:to_idx + 1]
    
    if len(segment) < 2:
        return linear_interpolate(from_coords, to_coords, progress)
    
    # Calculate total segment length
    total_length = 0.0
    lengths = []
    for i in range(len(segment) - 1):
        length = haversine_distance(
            segment[i][1], segment[i][0],
            segment[i+1][1], segment[i+1][0]
        )
        lengths.append(length)
        total_length += length
    
    if total_length == 0:
        return linear_interpolate(from_coords, to_coords, progress)
    
    # Find position along segment based on progress
    target_distance = total_length * progress
    cumulative = 0.0
    
    for i, length in enumerate(lengths):
        if cumulative + length >= target_distance:
            # Interpolate within this sub-segment
            sub_progress = (target_distance - cumulative) / length if length > 0 else 0
            return linear_interpolate(
                (segment[i][0], segment[i][1]),
                (segment[i+1][0], segment[i+1][1]),
                sub_progress
            )
        cumulative += length
    
    # At the end
    return (segment[-1][0], segment[-1][1])


def find_closest_track_point(
    coords: Tuple[float, float],
    track_coords: List[List[float]]
) -> int:
    """Find index of closest point on track to given coordinates."""
    min_dist = float('inf')
    closest_idx = 0
    
    for i, point in enumerate(track_coords):
        dist = (coords[0] - point[0]) ** 2 + (coords[1] - point[1]) ** 2
        if dist < min_dist:
            min_dist = dist
            closest_idx = i
    
    return closest_idx


def linear_interpolate(
    from_coords: Tuple[float, float],
    to_coords: Tuple[float, float],
    progress: float
) -> Tuple[float, float]:
    """Simple linear interpolation between two points."""
    lon = from_coords[0] + (to_coords[0] - from_coords[0]) * progress
    lat = from_coords[1] + (to_coords[1] - from_coords[1]) * progress
    return (lon, lat)


def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate bearing in degrees from point 1 to point 2."""
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    lon_diff = math.radians(lon2 - lon1)
    
    x = math.sin(lon_diff) * math.cos(lat2_rad)
    y = math.cos(lat1_rad) * math.sin(lat2_rad) - \
        math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(lon_diff)
    
    bearing = math.atan2(x, y)
    bearing = math.degrees(bearing)
    bearing = (bearing + 360) % 360
    
    return round(bearing, 1)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in meters."""
    R = 6371000  # Earth radius in meters
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c
