"""
GTFS Data Service
Handles loading, caching, and querying of static and real-time GTFS data
"""

import asyncio
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import aiofiles
import aiohttp
import httpx
import pandas as pd
from config import settings
from google.transit import gtfs_realtime_pb2

# URLs
STATIC_GTFS_URL = (
    "https://data.calgary.ca/download/npk7-z3bj/application%2Fx-zip-compressed"
)
VEHICLE_POSITIONS_URL = (
    "https://data.calgary.ca/download/am7c-qe3u/application%2Foctet-stream"
)
TRIP_UPDATES_URL = (
    "https://data.calgary.ca/download/gs4m-mdc2/application%2Foctet-stream"
)

# Paths
GTFS_DATA_DIR = Path("gtfs_data")
STATIC_GTFS_PATH = Path("gtfs_static.zip")

# Cache for static GTFS data (loaded once at startup)
_gtfs_cache: Dict[str, Any] = {
    "stops": None,
    "routes": None,
    "trips": None,
    "stop_times": None,
    "shapes": None,
    "calendar": None,
    "calendar_dates": None,
    # Pre-computed lookups
    "stop_by_id": {},
    "route_by_id": {},
    "trip_by_id": {},
    "trips_by_route": {},
    "stop_times_by_trip": {},
    "stop_times_by_stop": {},
    "loaded": False,
    "load_time": None,
}

# Real-time data cache (refreshed periodically)
_realtime_cache: Dict[str, Any] = {
    "vehicle_positions": [],
    "trip_updates": [],
    "trip_updates_by_stop": {},
    "trip_updates_by_trip": {},
    "last_fetch": None,
    "cache_duration": 30,  # seconds
}


async def download_static_gtfs() -> bool:
    """Download and extract static GTFS data if not present"""
    if GTFS_DATA_DIR.exists() and (GTFS_DATA_DIR / "stops.txt").exists():
        print("📁 Static GTFS data already exists")
        return True

    print("📥 Downloading static GTFS data...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(STATIC_GTFS_URL) as response:
                if response.status == 200:
                    GTFS_DATA_DIR.mkdir(exist_ok=True)
                    async with aiofiles.open(STATIC_GTFS_PATH, "wb") as f:
                        await f.write(await response.read())

                    with zipfile.ZipFile(STATIC_GTFS_PATH, "r") as zip_ref:
                        zip_ref.extractall(GTFS_DATA_DIR)

                    print(f"✅ Static GTFS data downloaded to {GTFS_DATA_DIR}")
                    return True
                else:
                    print(f"❌ Failed to download: {response.status}")
                    return False
    except Exception as e:
        print(f"❌ Error downloading GTFS: {e}")
        return False


def load_gtfs_static() -> bool:
    """Load all static GTFS data into memory with pre-computed indexes"""
    global _gtfs_cache

    if _gtfs_cache["loaded"]:
        return True

    try:
        print("📊 Loading static GTFS data...")

        # Load DataFrames
        _gtfs_cache["stops"] = pd.read_csv(GTFS_DATA_DIR / "stops.txt")
        _gtfs_cache["routes"] = pd.read_csv(GTFS_DATA_DIR / "routes.txt")
        _gtfs_cache["trips"] = pd.read_csv(GTFS_DATA_DIR / "trips.txt")
        _gtfs_cache["stop_times"] = pd.read_csv(GTFS_DATA_DIR / "stop_times.txt")
        _gtfs_cache["shapes"] = pd.read_csv(GTFS_DATA_DIR / "shapes.txt")

        # Load calendar if exists
        calendar_path = GTFS_DATA_DIR / "calendar.txt"
        if calendar_path.exists():
            _gtfs_cache["calendar"] = pd.read_csv(calendar_path)

        calendar_dates_path = GTFS_DATA_DIR / "calendar_dates.txt"
        if calendar_dates_path.exists():
            _gtfs_cache["calendar_dates"] = pd.read_csv(calendar_dates_path)

        # Pre-compute lookups for O(1) access
        print("🔧 Building lookup indexes...")

        # Stop by ID
        for _, row in _gtfs_cache["stops"].iterrows():
            _gtfs_cache["stop_by_id"][str(row["stop_id"])] = {
                "stop_id": str(row["stop_id"]),
                "stop_code": str(row.get("stop_code", row["stop_id"])),
                "stop_name": row["stop_name"],
                "stop_lat": row["stop_lat"],
                "stop_lon": row["stop_lon"],
                "location_type": row.get("location_type", 0),
            }

        # Route by ID with vehicle type detection
        for _, row in _gtfs_cache["routes"].iterrows():
            route_id = str(row["route_id"])
            route_type = int(row["route_type"])
            route_short_name = str(row.get("route_short_name", route_id))
            route_long_name = str(row.get("route_long_name", ""))

            # Determine vehicle type and category
            if route_type == 0:  # Tram/LRT
                vehicle_type = "CTrain"
                # Route 201 = Red Line, Route 202 = Blue Line
                # Route IDs may have suffixes like "201-20758"
                is_red = route_short_name == "201" or route_id.startswith("201")
                line = "Red" if is_red else "Blue"
                color = "#DC143C" if line == "Red" else "#0088FF"
                category = "LRT"
            else:  # Bus
                vehicle_type = "Bus"
                line = None
                color = "#22c55e"
                category = "REGULAR"

                try:
                    route_num = int(route_short_name)
                    if route_num in [301, 302, 303, 305, 306, 307]:
                        category = "BRT"
                        max_names = {
                            301: "MAX Orange",
                            302: "MAX Purple",
                            303: "MAX Yellow",
                            305: "MAX Teal",
                            306: "MAX Blue",
                            307: "MAX Green",
                        }
                        line = max_names.get(route_num)
                        color = "#f97316" if route_num == 301 else "#a855f7"
                    elif 400 <= route_num < 500:
                        category = "EXPRESS"
                except ValueError:
                    pass

            _gtfs_cache["route_by_id"][route_id] = {
                "route_id": route_id,
                "route_short_name": route_short_name,
                "route_long_name": route_long_name,
                "route_type": route_type,
                "vehicle_type": vehicle_type,
                "line": line,
                "color": color,
                "category": category,
            }

        # Trip by ID and trips by route
        for _, row in _gtfs_cache["trips"].iterrows():
            trip_id = str(row["trip_id"])
            route_id = str(row["route_id"])

            _gtfs_cache["trip_by_id"][trip_id] = {
                "trip_id": trip_id,
                "route_id": route_id,
                "service_id": str(row.get("service_id", "")),
                "trip_headsign": str(row.get("trip_headsign", "")),
                "direction_id": int(row.get("direction_id", 0)),
                "shape_id": str(row.get("shape_id", "")),
            }

            if route_id not in _gtfs_cache["trips_by_route"]:
                _gtfs_cache["trips_by_route"][route_id] = []
            _gtfs_cache["trips_by_route"][route_id].append(trip_id)

        # Stop times by trip and by stop
        print("🔧 Building stop_times indexes (this may take a moment)...")
        for _, row in _gtfs_cache["stop_times"].iterrows():
            trip_id = str(row["trip_id"])
            stop_id = str(row["stop_id"])

            stop_time_entry = {
                "trip_id": trip_id,
                "stop_id": stop_id,
                "arrival_time": row["arrival_time"],
                "departure_time": row["departure_time"],
                "stop_sequence": int(row["stop_sequence"]),
            }

            if trip_id not in _gtfs_cache["stop_times_by_trip"]:
                _gtfs_cache["stop_times_by_trip"][trip_id] = []
            _gtfs_cache["stop_times_by_trip"][trip_id].append(stop_time_entry)

            if stop_id not in _gtfs_cache["stop_times_by_stop"]:
                _gtfs_cache["stop_times_by_stop"][stop_id] = []
            _gtfs_cache["stop_times_by_stop"][stop_id].append(stop_time_entry)

        # Sort stop times by sequence for each trip
        for trip_id in _gtfs_cache["stop_times_by_trip"]:
            _gtfs_cache["stop_times_by_trip"][trip_id].sort(
                key=lambda x: x["stop_sequence"]
            )

        _gtfs_cache["loaded"] = True
        _gtfs_cache["load_time"] = datetime.now()

        print(f"✅ GTFS data loaded:")
        print(f"   • {len(_gtfs_cache['stop_by_id'])} stops")
        print(f"   • {len(_gtfs_cache['route_by_id'])} routes")
        print(f"   • {len(_gtfs_cache['trip_by_id'])} trips")
        print(
            f"   • {len(_gtfs_cache['stop_times_by_stop'])} stops with scheduled times"
        )

        return True

    except Exception as e:
        print(f"❌ Error loading GTFS data: {e}")
        return False


async def fetch_vehicle_positions() -> List[Dict]:
    """Fetch real-time vehicle positions from GTFS-RT"""
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(VEHICLE_POSITIONS_URL)
            response.raise_for_status()

            if len(response.content) == 0:
                return []

            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(response.content)

            vehicles = []
            for entity in feed.entity:
                if entity.HasField("vehicle"):
                    v = entity.vehicle

                    # Get route info
                    trip_id = v.trip.trip_id if v.HasField("trip") else None
                    route_id = v.trip.route_id if v.HasField("trip") else None

                    # If no route_id in vehicle, try to get from trip lookup
                    if (
                        not route_id
                        and trip_id
                        and trip_id in _gtfs_cache.get("trip_by_id", {})
                    ):
                        route_id = _gtfs_cache["trip_by_id"][trip_id].get("route_id")

                    route_info = _gtfs_cache.get("route_by_id", {}).get(
                        str(route_id), {}
                    )

                    vehicles.append(
                        {
                            "vehicle_id": (
                                v.vehicle.id if v.HasField("vehicle") else entity.id
                            ),
                            "trip_id": trip_id,
                            "route_id": route_id,
                            "route_short_name": route_info.get("route_short_name"),
                            "vehicle_type": route_info.get("vehicle_type", "Unknown"),
                            "line": route_info.get("line"),
                            "color": route_info.get("color"),
                            "headsign": _gtfs_cache.get("trip_by_id", {})
                            .get(trip_id, {})
                            .get("trip_headsign"),
                            "position": {
                                "latitude": (
                                    v.position.latitude
                                    if v.HasField("position")
                                    else None
                                ),
                                "longitude": (
                                    v.position.longitude
                                    if v.HasField("position")
                                    else None
                                ),
                                "bearing": (
                                    v.position.bearing
                                    if v.HasField("position")
                                    and v.position.HasField("bearing")
                                    else None
                                ),
                                "speed": (
                                    v.position.speed
                                    if v.HasField("position")
                                    and v.position.HasField("speed")
                                    else None
                                ),
                            },
                            "current_stop_sequence": (
                                v.current_stop_sequence
                                if v.HasField("current_stop_sequence")
                                else None
                            ),
                            "stop_id": v.stop_id if v.HasField("stop_id") else None,
                            "current_status": (
                                v.current_status
                                if v.HasField("current_status")
                                else None
                            ),
                            "timestamp": (
                                v.timestamp if v.HasField("timestamp") else None
                            ),
                        }
                    )

            return vehicles

    except Exception as e:
        print(f"❌ Error fetching vehicle positions: {e}")
        return []


async def fetch_trip_updates() -> List[Dict]:
    """Fetch real-time trip updates (arrival predictions) from GTFS-RT"""
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(TRIP_UPDATES_URL)
            response.raise_for_status()

            if len(response.content) == 0:
                return []

            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(response.content)

            updates = []
            for entity in feed.entity:
                if entity.HasField("trip_update"):
                    tu = entity.trip_update
                    trip_id = tu.trip.trip_id if tu.HasField("trip") else None
                    route_id = tu.trip.route_id if tu.HasField("trip") else None

                    # Get route info
                    route_info = _gtfs_cache.get("route_by_id", {}).get(
                        str(route_id), {}
                    )
                    trip_info = _gtfs_cache.get("trip_by_id", {}).get(str(trip_id), {})

                    stop_time_updates = []
                    for stu in tu.stop_time_update:
                        stop_id = stu.stop_id if stu.HasField("stop_id") else None
                        stop_info = _gtfs_cache.get("stop_by_id", {}).get(
                            str(stop_id), {}
                        )

                        stop_time_updates.append(
                            {
                                "stop_sequence": (
                                    stu.stop_sequence
                                    if stu.HasField("stop_sequence")
                                    else None
                                ),
                                "stop_id": stop_id,
                                "stop_name": stop_info.get("stop_name"),
                                "arrival": (
                                    {
                                        "delay": (
                                            stu.arrival.delay
                                            if stu.HasField("arrival")
                                            else 0
                                        ),
                                        "time": (
                                            stu.arrival.time
                                            if stu.HasField("arrival")
                                            else None
                                        ),
                                    }
                                    if stu.HasField("arrival")
                                    else None
                                ),
                                "departure": (
                                    {
                                        "delay": (
                                            stu.departure.delay
                                            if stu.HasField("departure")
                                            else 0
                                        ),
                                        "time": (
                                            stu.departure.time
                                            if stu.HasField("departure")
                                            else None
                                        ),
                                    }
                                    if stu.HasField("departure")
                                    else None
                                ),
                            }
                        )

                    updates.append(
                        {
                            "trip_id": trip_id,
                            "route_id": route_id,
                            "route_short_name": route_info.get("route_short_name"),
                            "vehicle_type": route_info.get("vehicle_type"),
                            "line": route_info.get("line"),
                            "color": route_info.get("color"),
                            "headsign": trip_info.get("trip_headsign")
                            or (tu.trip.trip_headsign if tu.HasField("trip") else None),
                            "direction_id": trip_info.get("direction_id"),
                            "start_time": (
                                tu.trip.start_time if tu.HasField("trip") else None
                            ),
                            "start_date": (
                                tu.trip.start_date if tu.HasField("trip") else None
                            ),
                            "vehicle_id": (
                                tu.vehicle.id if tu.HasField("vehicle") else None
                            ),
                            "stop_time_updates": stop_time_updates,
                            "timestamp": (
                                tu.timestamp if tu.HasField("timestamp") else None
                            ),
                        }
                    )

            return updates

    except Exception as e:
        print(f"❌ Error fetching trip updates: {e}")
        return []


async def refresh_realtime_data() -> None:
    """Refresh real-time data cache"""
    global _realtime_cache

    now = datetime.now()
    last_fetch = _realtime_cache.get("last_fetch")

    # Check if cache is still valid
    if (
        last_fetch
        and (now - last_fetch).total_seconds() < _realtime_cache["cache_duration"]
    ):
        return

    print(f"🔄 Refreshing real-time data...")

    # Fetch both in parallel
    vehicles, updates = await asyncio.gather(
        fetch_vehicle_positions(), fetch_trip_updates()
    )

    _realtime_cache["vehicle_positions"] = vehicles
    _realtime_cache["trip_updates"] = updates
    _realtime_cache["last_fetch"] = now

    # Build lookup by stop
    _realtime_cache["trip_updates_by_stop"] = {}
    _realtime_cache["trip_updates_by_trip"] = {}

    for update in updates:
        trip_id = update.get("trip_id")
        if trip_id:
            _realtime_cache["trip_updates_by_trip"][trip_id] = update

        for stu in update.get("stop_time_updates", []):
            stop_id = stu.get("stop_id")
            if stop_id:
                if stop_id not in _realtime_cache["trip_updates_by_stop"]:
                    _realtime_cache["trip_updates_by_stop"][stop_id] = []
                _realtime_cache["trip_updates_by_stop"][stop_id].append(
                    {
                        **stu,
                        "trip_id": trip_id,
                        "route_id": update.get("route_id"),
                        "route_short_name": update.get("route_short_name"),
                        "vehicle_type": update.get("vehicle_type"),
                        "line": update.get("line"),
                        "color": update.get("color"),
                        "headsign": update.get("headsign"),
                        "vehicle_id": update.get("vehicle_id"),
                    }
                )

    print(
        f"✅ Real-time data refreshed: {len(vehicles)} vehicles, {len(updates)} trip updates"
    )


# ============================================
# Public API Functions
# ============================================


def get_stop(stop_id: str) -> Optional[Dict]:
    """Get stop information by ID"""
    return _gtfs_cache["stop_by_id"].get(str(stop_id))


def get_route(route_id: str) -> Optional[Dict]:
    """Get route information by ID"""
    return _gtfs_cache["route_by_id"].get(str(route_id))


def get_trip(trip_id: str) -> Optional[Dict]:
    """Get trip information by ID"""
    return _gtfs_cache["trip_by_id"].get(str(trip_id))


def get_all_stops() -> List[Dict]:
    """Get all stops"""
    return list(_gtfs_cache["stop_by_id"].values())


def get_all_routes() -> List[Dict]:
    """Get all routes"""
    return list(_gtfs_cache["route_by_id"].values())


def get_scheduled_stop_times(stop_id: str) -> List[Dict]:
    """Get scheduled stop times for a stop"""
    return _gtfs_cache["stop_times_by_stop"].get(str(stop_id), [])


def get_trip_stop_times(trip_id: str) -> List[Dict]:
    """Get all stop times for a trip in sequence order"""
    return _gtfs_cache["stop_times_by_trip"].get(str(trip_id), [])


def get_routes_serving_stop(stop_id: str) -> List[Dict]:
    """Get all routes that serve a specific stop"""
    stop_times = get_scheduled_stop_times(stop_id)
    route_ids = set()

    for st in stop_times:
        trip_id = st.get("trip_id")
        trip = get_trip(trip_id)
        if trip:
            route_ids.add(trip.get("route_id"))

    routes = []
    for route_id in route_ids:
        route = get_route(route_id)
        if route:
            routes.append(route)

    return routes


async def get_realtime_arrivals(stop_id: str) -> List[Dict]:
    """
    Get real-time arrival predictions for a stop.
    This is the key function for getting "when does the next bus/train arrive?"
    """
    await refresh_realtime_data()

    arrivals = _realtime_cache["trip_updates_by_stop"].get(str(stop_id), [])
    stop_info = get_stop(stop_id)

    # Process and format arrivals
    result = []
    now = datetime.now()

    for arrival in arrivals:
        arrival_time = None
        delay = 0

        if arrival.get("arrival"):
            arrival_time = arrival["arrival"].get("time")
            delay = arrival["arrival"].get("delay", 0)
        elif arrival.get("departure"):
            arrival_time = arrival["departure"].get("time")
            delay = arrival["departure"].get("delay", 0)

        if arrival_time:
            arrival_dt = datetime.fromtimestamp(arrival_time)
            minutes_away = int((arrival_dt - now).total_seconds() / 60)

            if minutes_away >= -1:  # Include arrivals that just happened
                result.append(
                    {
                        "trip_id": arrival.get("trip_id"),
                        "route_id": arrival.get("route_id"),
                        "route_short_name": arrival.get("route_short_name"),
                        "vehicle_type": arrival.get("vehicle_type"),
                        "line": arrival.get("line"),
                        "color": arrival.get("color"),
                        "headsign": arrival.get("headsign"),
                        "vehicle_id": arrival.get("vehicle_id"),
                        "stop_id": stop_id,
                        "stop_name": stop_info.get("stop_name") if stop_info else None,
                        "arrival_time": arrival_dt.isoformat(),
                        "arrival_timestamp": arrival_time,
                        "delay_seconds": delay,
                        "delay_minutes": round(delay / 60, 1) if delay else 0,
                        "minutes_away": max(0, minutes_away),
                        "status": (
                            "Arriving" if minutes_away <= 0 else f"{minutes_away} min"
                        ),
                    }
                )

    # Sort by arrival time
    result.sort(key=lambda x: x["arrival_timestamp"])

    return result


async def get_vehicle_positions(
    vehicle_type: Optional[str] = None,
    route_id: Optional[str] = None,
    line: Optional[str] = None,
) -> List[Dict]:
    """Get real-time vehicle positions with optional filters"""
    await refresh_realtime_data()

    vehicles = _realtime_cache["vehicle_positions"]

    # Apply filters
    if vehicle_type:
        vehicles = [v for v in vehicles if v.get("vehicle_type") == vehicle_type]
    if route_id:
        vehicles = [v for v in vehicles if v.get("route_id") == route_id]
    if line:
        vehicles = [
            v
            for v in vehicles
            if v.get("line") and line.lower() in v.get("line", "").lower()
        ]

    return vehicles


def is_loaded() -> bool:
    """Check if GTFS data is loaded"""
    return _gtfs_cache["loaded"]


def get_cache_stats() -> Dict:
    """Get cache statistics"""
    return {
        "static_loaded": _gtfs_cache["loaded"],
        "static_load_time": (
            _gtfs_cache["load_time"].isoformat() if _gtfs_cache["load_time"] else None
        ),
        "stops_count": len(_gtfs_cache["stop_by_id"]),
        "routes_count": len(_gtfs_cache["route_by_id"]),
        "trips_count": len(_gtfs_cache["trip_by_id"]),
        "realtime_last_fetch": (
            _realtime_cache["last_fetch"].isoformat()
            if _realtime_cache["last_fetch"]
            else None
        ),
        "realtime_vehicles": len(_realtime_cache["vehicle_positions"]),
        "realtime_trip_updates": len(_realtime_cache["trip_updates"]),
    }
