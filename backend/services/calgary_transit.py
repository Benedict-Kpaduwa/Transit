import asyncio
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiofiles
import aiohttp
import httpx
import pandas as pd
from config import settings
from google.transit import gtfs_realtime_pb2
from models.geo import GeoJSONFeature, GeoJSONFeatureCollection, Geometry

BUS_STOPS_API = "https://data.calgary.ca/resource/muzh-c9qc.json"
BUS_ROUTES_API = "https://data.calgary.ca/resource/pm3p-838w.json"

LRT_STATIONS_API = "https://data.calgary.ca/resource/2axz-xm4q.json"
LRT_ROUTES_API = "https://data.calgary.ca/resource/2wti-eh59.json"

VEHICLE_POSITIONS_URL = (
    "https://data.calgary.ca/download/am7c-qe3u/application%2Foctet-stream"
)
TRIP_UPDATES_URL = (
    "https://data.calgary.ca/download/gs4m-mdc2/application%2Foctet-stream"
)

STATIC_GTFS_URL = (
    "https://data.calgary.ca/download/npk7-z3bj/application%2Fx-zip-compressed"
)
STATIC_GTFS_PATH = Path("gtfs_static.zip")
GTFS_DATA_DIR = Path("gtfs_data")


async def make_api_request(
    url: str,
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Make HTTP request with error handling"""
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            print(f"HTTP Error for {url}: {e.response.status_code}")
            print(f"Response: {e.response.text[:200]}")
            raise
        except Exception as e:
            print(f"Request failed for {url}: {str(e)}")
            raise


async def download_static_gtfs():
    """Download and extract static GTFS data"""
    if GTFS_DATA_DIR.exists():
        print("📁 Static GTFS data already downloaded")
        return True

    print("📥 Downloading static GTFS data...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(STATIC_GTFS_URL) as response:
                if response.status == 200:
                    async with aiofiles.open(STATIC_GTFS_PATH, "wb") as f:
                        await f.write(await response.read())

                    with zipfile.ZipFile(STATIC_GTFS_PATH, "r") as zip_ref:
                        zip_ref.extractall(GTFS_DATA_DIR)

                    print(
                        f"✅ Static GTFS data downloaded and extracted to {GTFS_DATA_DIR}"
                    )
                    return True
                else:
                    print(f"❌ Failed to download static GTFS data: {response.status}")
                    return False
    except Exception as e:
        print(f"❌ Error downloading static GTFS: {str(e)}")
        return False


def load_static_gtfs_data():
    """Load static GTFS data into memory"""
    try:
        trips_df = pd.read_csv(GTFS_DATA_DIR / "trips.txt")
        routes_df = pd.read_csv(GTFS_DATA_DIR / "routes.txt")

        trip_to_route = dict(
            zip(trips_df["trip_id"].astype(str), trips_df["route_id"].astype(str))
        )

        route_info = {}
        for _, row in routes_df.iterrows():
            route_id = str(row["route_id"])
            route_short_name = (
                str(row["route_short_name"])
                if pd.notna(row["route_short_name"])
                else route_id
            )
            route_long_name = (
                str(row["route_long_name"]) if pd.notna(row["route_long_name"]) else ""
            )
            route_type = int(row["route_type"])

            if route_type == 0:
                vehicle_type = "CTRAIN"
                line = "RED" if route_id == "201" else "BLUE"
                category = None
            else:  # Bus
                vehicle_type = "BUS"
                line = None

                try:
                    route_num = int(route_short_name)
                    if route_num in [301, 302, 303, 305, 306, 307]:
                        category = "BRT"
                        max_lines = {
                            301: "MAX Orange",
                            302: "MAX Purple",
                            303: "MAX Yellow",
                            305: "MAX Teal",
                            306: "MAX Blue",
                            307: "MAX Green",
                        }
                        line = max_lines.get(route_num, f"MAX {route_short_name}")
                    elif 300 <= route_num < 400:
                        category = "REGULAR"
                    elif 400 <= route_num < 500:
                        category = "EXPRESS"
                    else:
                        category = "REGULAR"
                except ValueError:
                    category = "REGULAR"

            route_info[route_id] = {
                "vehicle_type": vehicle_type,
                "line": line,
                "category": category,
                "route_short_name": route_short_name,
                "route_long_name": route_long_name,
                "route_type": route_type,
            }

        print(f"📊 Loaded static GTFS data:")
        print(f"   • {len(trip_to_route)} trip_id -> route_id mappings")
        print(f"   • {len(route_info)} unique routes")

        ctrain_routes = [
            r for r, info in route_info.items() if info["vehicle_type"] == "CTRAIN"
        ]
        bus_routes = [
            r for r, info in route_info.items() if info["vehicle_type"] == "BUS"
        ]
        brt_routes = [
            r for r, info in route_info.items() if info.get("category") == "BRT"
        ]

        print(f"   • C-Train routes: {len(ctrain_routes)}")
        print(f"   • Bus routes: {len(bus_routes)}")
        print(
            f"   • BRT routes: {len(brt_routes)} → {[route_info[r]['route_short_name'] for r in brt_routes]}"
        )

        return trip_to_route, route_info

    except Exception as e:
        print(f"❌ Error loading static GTFS data: {str(e)}")
        return {}, {}


async def get_realtime_trip_updates() -> List[Dict]:
    """
    Fetch real-time trip updates (arrival predictions) from Calgary Transit
    Returns list of trip updates with stop time predictions
    """
    try:
        print(f"🚇 Fetching trip updates from Calgary Transit...")

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(TRIP_UPDATES_URL)
            print(f"📡 Response status: {response.status_code}")
            print(f"📦 Content length: {len(response.content)} bytes")
            response.raise_for_status()

            if len(response.content) == 0:
                print("⚠️  Empty response received")
                return []

            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(response.content)

            print(f"📊 Total entities in feed: {len(feed.entity)}")

            trip_updates = []

            for entity in feed.entity:
                if entity.HasField("trip_update"):
                    trip_update = entity.trip_update

                    stop_updates = []
                    for stop_time_update in trip_update.stop_time_update:
                        stop_update = {
                            "stop_sequence": (
                                stop_time_update.stop_sequence
                                if stop_time_update.HasField("stop_sequence")
                                else None
                            ),
                            "stop_id": (
                                stop_time_update.stop_id
                                if stop_time_update.HasField("stop_id")
                                else None
                            ),
                            "arrival": (
                                {
                                    "delay": (
                                        stop_time_update.arrival.delay
                                        if stop_time_update.HasField("arrival")
                                        else None
                                    ),
                                    "time": (
                                        stop_time_update.arrival.time
                                        if stop_time_update.HasField("arrival")
                                        else None
                                    ),
                                }
                                if stop_time_update.HasField("arrival")
                                else None
                            ),
                            "departure": (
                                {
                                    "delay": (
                                        stop_time_update.departure.delay
                                        if stop_time_update.HasField("departure")
                                        else None
                                    ),
                                    "time": (
                                        stop_time_update.departure.time
                                        if stop_time_update.HasField("departure")
                                        else None
                                    ),
                                }
                                if stop_time_update.HasField("departure")
                                else None
                            ),
                        }
                        stop_updates.append(stop_update)

                    update_data = {
                        "id": entity.id,
                        "trip_id": (
                            trip_update.trip.trip_id
                            if trip_update.HasField("trip")
                            else None
                        ),
                        "route_id": (
                            trip_update.trip.route_id
                            if trip_update.HasField("trip")
                            else None
                        ),
                        "start_time": (
                            trip_update.trip.start_time
                            if trip_update.HasField("trip")
                            else None
                        ),
                        "start_date": (
                            trip_update.trip.start_date
                            if trip_update.HasField("trip")
                            else None
                        ),
                        "vehicle_id": (
                            trip_update.vehicle.id
                            if trip_update.HasField("vehicle")
                            else None
                        ),
                        "timestamp": (
                            trip_update.timestamp
                            if trip_update.HasField("timestamp")
                            else None
                        ),
                        "stop_time_updates": stop_updates,
                    }

                    trip_updates.append(update_data)

            ctrain_updates = [
                u
                for u in trip_updates
                if u.get("route_id")
                and str(u.get("route_id")).strip() in ["201", "202"]
            ]

            print(
                f"✅ Found {len(trip_updates)} total updates, {len(ctrain_updates)} C-Train updates"
            )

            # Debug: print unique route IDs
            unique_routes = set(
                str(u.get("route_id")) for u in trip_updates if u.get("route_id")
            )
            print(f"🔍 Unique route IDs in feed: {unique_routes}")

            return ctrain_updates

    except httpx.HTTPStatusError as e:
        print(f"❌ HTTP Error fetching trip updates: {e.response.status_code}")
        print(f"Response text: {e.response.text[:500]}")
        return []
    except Exception as e:
        print(f"❌ Error fetching trip updates: {str(e)}")
        import traceback

        traceback.print_exc()
        return []


async def get_realtime_vehicle_positions() -> List[Dict]:
    """
    Fetch real-time vehicle positions from Calgary Transit GTFS-RT feed
    Returns list of vehicles with their current positions
    """
    try:
        print(f"🚇 Fetching vehicle positions from Calgary Transit...")

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(VEHICLE_POSITIONS_URL)
            print(f"Response status: {response.status_code}")
            print(f"Content length: {len(response.content)} bytes")
            response.raise_for_status()

            if len(response.content) == 0:
                print("Empty response received")
                return []

            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(response.content)

            print(
                f"Feed header timestamp: {feed.header.timestamp if feed.header.HasField('timestamp') else 'N/A'}"
            )
            print(f"Total entities in feed: {len(feed.entity)}")

            vehicles = []

            for entity in feed.entity:
                if not entity.HasField("vehicle"):
                    continue

                vehicle = entity.vehicle
                trip = vehicle.trip if vehicle.HasField("trip") else None

                route_id = None
                if trip and trip.HasField("route_id"):
                    route_id = trip.route_id

                vehicle_data = {
                    "id": entity.id,
                    "trip_id": (
                        trip.trip_id if trip and trip.HasField("trip_id") else None
                    ),
                    "vehicle_id": (
                        vehicle.vehicle.id if vehicle.HasField("vehicle") else None
                    ),
                    "position": {
                        "latitude": (
                            vehicle.position.latitude
                            if vehicle.HasField("position")
                            else None
                        ),
                        "longitude": (
                            vehicle.position.longitude
                            if vehicle.HasField("position")
                            else None
                        ),
                    },
                    "timestamp": (
                        vehicle.timestamp if vehicle.HasField("timestamp") else None
                    ),
                    "route_id": route_id,
                }

                vehicles.append(vehicle_data)

            print(f"Found {len(vehicles)} total vehicles")

            vehicles_with_route = [v for v in vehicles if v["route_id"]]
            print(f"Vehicles with route_id: {len(vehicles_with_route)}")

            unique_routes = set(v["route_id"] for v in vehicles if v["route_id"])
            print(f"Unique route IDs in vehicle positions: {unique_routes}")

            return vehicles

    except httpx.HTTPStatusError as e:
        print(f"❌ HTTP Error fetching vehicle positions: {e.response.status_code}")
        print(f"Response text: {e.response.text[:500]}")
        return []
    except Exception as e:
        print(f"❌ Error fetching vehicle positions: {str(e)}")
        import traceback

        traceback.print_exc()
        return []


async def get_realtime_ctrain_positions_with_routes(
    line: Optional[str] = None,
) -> List[Dict]:
    """
    Fetch C-Train vehicle positions and enrich with route info

    Args:
        line: Filter by C-Train line (RED/BLUE)
    """
    try:
        vehicles, trip_updates, lrt_stations = await asyncio.gather(
            get_realtime_vehicle_positions(),
            get_realtime_trip_updates(),
            get_lrt_stations_sorted_geojson(None),
        )

        print(f"📋 Loaded {len(vehicles)} vehicles, {len(trip_updates)} trip updates")

        trip_to_route = {}
        ctrain_route_info = {}

        for update in trip_updates:
            trip_id = update.get("trip_id")
            route_id = update.get("route_id")

            if trip_id and route_id and route_id in ["201", "202"]:
                trip_to_route[trip_id] = route_id

                if route_id not in ctrain_route_info:
                    ctrain_route_info[route_id] = {
                        "type": "CTRAIN",
                        "line": "RED" if route_id == "201" else "BLUE",
                    }

        print(f"📋 C-Train route mappings: {len(trip_to_route)}")

        lrt_coords = []
        for feature in lrt_stations.features:
            if feature.geometry.type == "Point":
                lon, lat = feature.geometry.coordinates
                route = feature.properties.get("route")
                lrt_coords.append(
                    {
                        "lat": lat,
                        "lon": lon,
                        "route": route,
                        "name": feature.properties.get("name"),
                    }
                )

        def distance(lat1, lon1, lat2, lon2):
            return ((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2) ** 0.5

        ctrain_vehicles = []
        match_methods = {
            "direct_route_id": 0,
            "trip_update_match": 0,
            "spatial_match": 0,
        }

        for vehicle in vehicles:
            position = vehicle.get("position", {})
            v_lat = position.get("latitude")
            v_lon = position.get("longitude")
            trip_id = vehicle.get("trip_id")

            if v_lat is None or v_lon is None:
                continue

            route_id_from_vehicle = vehicle.get("route_id")
            is_ctrain = False

            if route_id_from_vehicle in ["201", "202"]:
                vehicle["vehicle_type"] = "CTRAIN"
                vehicle["line"] = "RED" if route_id_from_vehicle == "201" else "BLUE"
                is_ctrain = True
                match_methods["direct_route_id"] += 1

            elif trip_id and trip_id in trip_to_route:
                route_id = trip_to_route[trip_id]
                vehicle["route_id"] = route_id
                vehicle["vehicle_type"] = "CTRAIN"
                vehicle["line"] = "RED" if route_id == "201" else "BLUE"
                is_ctrain = True
                match_methods["trip_update_match"] += 1

            else:
                nearest_station = None
                min_distance = float("inf")

                for station in lrt_coords:
                    dist = distance(v_lat, v_lon, station["lat"], station["lon"])
                    if dist < min_distance:
                        min_distance = dist
                        nearest_station = station

                if nearest_station and min_distance < 0.006:
                    route = nearest_station["route"]
                    vehicle["route_id"] = route
                    vehicle["vehicle_type"] = "CTRAIN"
                    vehicle["nearest_station"] = nearest_station["name"]
                    vehicle["distance_to_station"] = round(min_distance * 111000, 2)

                    if route == "201":
                        vehicle["line"] = "RED"
                    elif route == "202":
                        vehicle["line"] = "BLUE"
                    elif route in ["201/202", "202/201"]:
                        vehicle["line"] = "RED/BLUE"
                    else:
                        vehicle["line"] = None

                    is_ctrain = True
                    match_methods["spatial_match"] += 1

            if is_ctrain:
                if "nearest_station" not in vehicle:
                    nearest_station = None
                    min_distance = float("inf")

                    for station in lrt_coords:
                        dist = distance(v_lat, v_lon, station["lat"], station["lon"])
                        if dist < min_distance:
                            min_distance = dist
                            nearest_station = station

                    if nearest_station:
                        vehicle["nearest_station"] = nearest_station["name"]
                        vehicle["distance_to_station"] = round(min_distance * 111000, 2)

                ctrain_vehicles.append(vehicle)

        print(f"\n✅ C-Train Identification Complete:")
        print(f"   • Total C-Trains found: {len(ctrain_vehicles)}")

        print(f"\n🔍 Matching Methods Used:")
        for method, count in match_methods.items():
            if count > 0:
                method_name = method.replace("_", " ").title()
                print(f"   • {method_name}: {count} vehicles")

        if line and line.upper() in ["RED", "BLUE"]:
            target_route = "201" if line.upper() == "RED" else "202"
            ctrain_vehicles = [
                v
                for v in ctrain_vehicles
                if (
                    v.get("route_id") == target_route
                    or v.get("route_id") in ["201/202", "202/201"]
                )
            ]
            print(
                f"\n   • Filtered for {line.upper()} line: {len(ctrain_vehicles)} vehicles"
            )

        print(f"\n✅ Returning {len(ctrain_vehicles)} C-Trains")

        return ctrain_vehicles

    except Exception as e:
        print(f"❌ Error getting C-Train positions: {str(e)}")
        import traceback

        traceback.print_exc()
        return []


async def get_realtime_bus_positions_with_routes(
    route_category: Optional[str] = None,
    route_id: Optional[str] = None,
    debug_unmatched: bool = False,  # Add this parameter
) -> List[Dict]:
    """
    Fetch bus vehicle positions and enrich with route info using static GTFS

    Args:
        route_category: Filter by category (BRT, REGULAR, EXPRESS)
        route_id: Filter by specific route ID (e.g., "301", "1", "10")
        debug_unmatched: Print detailed info about unmatched buses
    """
    try:
        # Ensure static GTFS data is downloaded
        await download_static_gtfs()

        # Load static GTFS data
        trip_to_route_static, route_info_static = load_static_gtfs_data()

        # Fetch vehicle positions
        vehicles = await get_realtime_vehicle_positions()

        print(f"📋 Processing {len(vehicles)} vehicles for bus identification")
        print(
            f"📊 Static GTFS: {len(trip_to_route_static)} trip mappings, {len(route_info_static)} routes"
        )

        # Get LRT station coordinates for filtering out C-Trains
        lrt_stations = await get_lrt_stations_sorted_geojson(None)
        lrt_coords = []
        for feature in lrt_stations.features:
            if feature.geometry.type == "Point":
                lon, lat = feature.geometry.coordinates
                lrt_coords.append({"lat": lat, "lon": lon})

        def distance(lat1, lon1, lat2, lon2):
            return ((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2) ** 0.5

        def is_near_lrt_station(lat, lon):
            """Check if position is near any LRT station"""
            for station in lrt_coords:
                if distance(lat, lon, station["lat"], station["lon"]) < 0.006:
                    return True
            return False

        def classify_bus_route(route_id_str, route_info=None):
            """
            Classify bus route and determine if it's BRT
            Returns: (category, line_name)
            """
            # If we have route info from static GTFS, use it first
            if route_info:
                category = route_info.get("category")
                line = route_info.get("line")

                # But override if we detect it's a MAX route
                try:
                    route_num = int(route_id_str)
                    if route_num in [301, 302, 303, 305, 306, 307]:
                        category = "BRT"
                        max_lines = {
                            301: "MAX Orange",
                            302: "MAX Purple",
                            303: "MAX Yellow",
                            305: "MAX Teal",
                            306: "MAX Blue",
                            307: "MAX Green",
                        }
                        line = max_lines.get(route_num)
                except ValueError:
                    pass

                return category, line

            # Fallback: classify based on route number
            try:
                route_num = int(route_id_str)

                # MAX BRT routes
                if route_num in [301, 302, 303, 305, 306, 307]:
                    max_lines = {
                        301: "MAX Orange",
                        302: "MAX Purple",
                        303: "MAX Yellow",
                        305: "MAX Teal",
                        306: "MAX Blue",
                        307: "MAX Green",
                    }
                    return "BRT", max_lines.get(route_num, f"MAX {route_id_str}")

                # Other 300-series might be regular routes
                elif 300 <= route_num < 400:
                    return "REGULAR", None

                # Express routes
                elif 400 <= route_num < 500:
                    return "EXPRESS", None

                # Regular routes
                else:
                    return "REGULAR", None

            except ValueError:
                return "REGULAR", None

        bus_vehicles = []
        matched_count = 0
        unmatched_count = 0
        filtered_ctrain_count = 0
        unmatched_buses = []  # Store unmatched for debugging

        category_counts = {"BRT": 0, "REGULAR": 0, "EXPRESS": 0}

        for vehicle in vehicles:
            position = vehicle.get("position", {})
            v_lat = position.get("latitude")
            v_lon = position.get("longitude")
            trip_id = vehicle.get("trip_id")
            vehicle_id = vehicle.get("vehicle_id")

            if v_lat is None or v_lon is None:
                continue

            # Skip if near LRT station (likely C-Train)
            if is_near_lrt_station(v_lat, v_lon):
                filtered_ctrain_count += 1
                continue

            # Skip if route_id indicates C-Train
            vehicle_route_id = vehicle.get("route_id")
            if vehicle_route_id in ["201", "202"]:
                filtered_ctrain_count += 1
                continue

            # Try to match using static GTFS
            if trip_id and trip_id in trip_to_route_static:
                route_id_from_gtfs = trip_to_route_static[trip_id]

                # Skip C-Train routes
                if route_id_from_gtfs in ["201", "202"]:
                    filtered_ctrain_count += 1
                    continue

                vehicle["route_id"] = route_id_from_gtfs

                # Get route info from static GTFS
                route_info = route_info_static.get(route_id_from_gtfs)

                # Classify the route (with override for MAX routes)
                category, line = classify_bus_route(route_id_from_gtfs, route_info)

                vehicle["vehicle_type"] = "BUS"
                vehicle["category"] = category
                vehicle["line"] = line

                if route_info:
                    vehicle["route_short_name"] = route_info.get(
                        "route_short_name", route_id_from_gtfs
                    )
                    vehicle["route_long_name"] = route_info.get("route_long_name")
                else:
                    vehicle["route_short_name"] = route_id_from_gtfs
                    vehicle["route_long_name"] = None

                matched_count += 1
                category_counts[category] = category_counts.get(category, 0) + 1
                bus_vehicles.append(vehicle)

            else:
                # No match in static GTFS - include as unknown bus
                vehicle["route_id"] = None
                vehicle["vehicle_type"] = "BUS"
                vehicle["line"] = None
                vehicle["category"] = None
                vehicle["route_short_name"] = None
                vehicle["route_long_name"] = None
                unmatched_count += 1

                # Store for debugging
                unmatched_buses.append(
                    {
                        "vehicle_id": vehicle_id,
                        "trip_id": trip_id,
                        "position": {"lat": v_lat, "lon": v_lon},
                        "timestamp": vehicle.get("timestamp"),
                        "entity_id": vehicle.get("id"),
                    }
                )

                bus_vehicles.append(vehicle)

        print(f"\n✅ Bus identification complete:")
        print(f"   • Total vehicles processed: {len(vehicles)}")
        print(f"   • Filtered C-Trains: {filtered_ctrain_count}")
        print(f"   • Buses matched with route info: {matched_count}")
        print(f"   • Buses without route info: {unmatched_count}")
        print(f"   • Total buses: {len(bus_vehicles)}")

        print(f"\n📊 Buses by category:")
        for cat, count in category_counts.items():
            if count > 0:
                print(f"   • {cat}: {count} buses")

        # DEBUG: Print unmatched buses
        if debug_unmatched and unmatched_buses:
            print(f"\n" + "=" * 80)
            print(f"🔍 DEBUG: UNMATCHED BUSES ({len(unmatched_buses)} total)")
            print("=" * 80)

            for i, bus in enumerate(unmatched_buses[:20]):  # Show first 20
                print(f"\n[{i+1}] Unmatched Bus:")
                print(f"    • Vehicle ID: {bus['vehicle_id']}")
                print(f"    • Trip ID: {bus['trip_id']}")
                print(f"    • Entity ID: {bus['entity_id']}")
                print(
                    f"    • Position: ({bus['position']['lat']:.6f}, {bus['position']['lon']:.6f})"
                )
                print(f"    • Timestamp: {bus['timestamp']}")

                # Check if trip_id exists in GTFS at all
                if bus["trip_id"]:
                    if bus["trip_id"] in trip_to_route_static:
                        print(
                            f"    ⚠️  FOUND IN GTFS! Route: {trip_to_route_static[bus['trip_id']]}"
                        )
                    else:
                        print(f"    ❌ Not in GTFS static data")
                        # Check if similar trip IDs exist
                        trip_prefix = (
                            bus["trip_id"][:6]
                            if len(bus["trip_id"]) > 6
                            else bus["trip_id"][:3]
                        )
                        similar = [
                            t
                            for t in list(trip_to_route_static.keys())[:100]
                            if t.startswith(trip_prefix)
                        ]
                        if similar:
                            print(f"    🔍 Similar trip IDs: {similar[:5]}")

            if len(unmatched_buses) > 20:
                print(f"\n... and {len(unmatched_buses) - 20} more unmatched buses")

            print("=" * 80 + "\n")

        # Apply filters
        filtered_buses = bus_vehicles

        # Filter by specific route ID
        if route_id:
            filtered_buses = [
                b for b in filtered_buses if b.get("route_id") == route_id
            ]
            print(f"\n   • Filtered for route {route_id}: {len(filtered_buses)} buses")

        # Filter by category
        if route_category:
            category_upper = route_category.upper()
            before_count = len(filtered_buses)
            filtered_buses = [
                b for b in filtered_buses if b.get("category") == category_upper
            ]
            print(
                f"\n   • Filtered for {category_upper} category: {len(filtered_buses)} buses (from {before_count})"
            )

            # Debug: Show what we found
            if len(filtered_buses) > 0:
                unique_routes = set(
                    b.get("route_short_name")
                    for b in filtered_buses
                    if b.get("route_short_name")
                )
                print(f"   • Routes in {category_upper}: {sorted(unique_routes)}")

        print(f"\n✅ Returning {len(filtered_buses)} buses")

        # Show sample results
        if filtered_buses and len(filtered_buses) <= 10:
            print(f"\n📋 Sample results:")
            for i, bus in enumerate(filtered_buses[:10]):
                route = bus.get("route_short_name", "Unknown")
                category = bus.get("category", "N/A")
                line = bus.get("line", "N/A")
                print(f"   [{i}] Route: {route}, Category: {category}, Line: {line}")

        return filtered_buses

    except Exception as e:
        print(f"❌ Error getting bus positions: {str(e)}")
        import traceback

        traceback.print_exc()
        return []


async def get_buses_geojson(
    route_category: Optional[str] = None, route_id: Optional[str] = None
) -> Dict:
    """
    Get bus positions as GeoJSON
    """
    buses = await get_realtime_bus_positions_with_routes(
        route_category=route_category, route_id=route_id
    )

    features = []
    for bus in buses:
        position = bus.get("position", {})
        lat = position.get("latitude")
        lon = position.get("longitude")

        if lat is not None and lon is not None:
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {
                        "vehicle_id": bus.get("vehicle_id"),
                        "route_id": bus.get("route_id"),
                        "route_short_name": bus.get("route_short_name"),
                        "route_long_name": bus.get("route_long_name"),
                        "line": bus.get("line"),
                        "category": bus.get("category"),
                        "trip_id": bus.get("trip_id"),
                        "timestamp": bus.get("timestamp"),
                        "type": "BUS",
                    },
                }
            )

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "count": len(features),
            "route_category": route_category,
            "route_id": route_id,
            "timestamp": datetime.now().isoformat(),
        },
    }


async def get_vehicles_geojson(line: Optional[str] = None) -> Dict:
    """
    Get vehicle positions as GeoJSON for easy frontend consumption
    """
    vehicles = await get_realtime_vehicle_positions_with_routes()

    if line:
        route_id = "201" if line.upper() == "RED" else "202"
        vehicles = [v for v in vehicles if str(v.get("route_id")).strip() == route_id]

    features = []
    for vehicle in vehicles:
        position = vehicle.get("position", {})
        lat = position.get("latitude")
        lon = position.get("longitude")

        if lat and lon:
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {
                        "vehicle_id": vehicle.get("vehicle_id"),
                        "route_id": vehicle.get("route_id"),
                        "trip_id": vehicle.get("trip_id"),
                        "line": (
                            "RED"
                            if str(vehicle.get("route_id")).strip() == "201"
                            else "BLUE"
                        ),
                        "bearing": position.get("bearing"),
                        "speed": position.get("speed"),
                        "stop_id": vehicle.get("stop_id"),
                        "timestamp": vehicle.get("timestamp"),
                        "type": "VEHICLE",
                    },
                }
            )

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {"count": len(features), "timestamp": datetime.now().isoformat()},
    }


def sort_stations_geographically(stations: List[Dict], line: str) -> List[Dict]:
    """Sort stations geographically based on line direction"""
    stations_with_coords = []

    for station in stations:
        geom = station.get("the_geom")
        if geom and geom.get("coordinates"):
            try:
                stations_with_coords.append(
                    {
                        "station": station,
                        "lon": float(geom["coordinates"][0]),
                        "lat": float(geom["coordinates"][1]),
                    }
                )
            except (ValueError, TypeError):
                continue

    if line.upper() == "RED":
        stations_with_coords.sort(key=lambda x: (-x["lat"], x["lon"]))
    elif line.upper() == "BLUE":
        stations_with_coords.sort(key=lambda x: (x["lon"], -x["lat"]))
    else:
        stations_with_coords.sort(key=lambda x: (x["lon"], x["lat"]))

    return [item["station"] for item in stations_with_coords]


def sort_stations_by_known_order(stations: List[Dict], line: str) -> List[Dict]:
    """Sort stations using known Calgary C-Train station order"""
    RED_LINE_ORDER = [
        "Tuscany",
        "Crowfoot",
        "Dalhousie",
        "Brentwood",
        "University",
        "Banff Trail",
        "Lions Park",
        "SAIT/ACAD/Jubilee",
        "Sunnyside",
        "8th Street SW",
        "7th Street SW",
        "6th Street SW",
        "4th Street SW",
        "3rd Street SW",
        "1st Street SW",
        "Centre Street",
        "City Hall",
        "Victoria Park/Stampede",
        "Erlton/Stampede",
        "39 Avenue",
        "Chinook",
        "Heritage",
        "Southland",
        "Anderson",
        "Canyon Meadows",
        "Fish Creek - Lacombe",
        "Shawnessy",
        "Somerset-Bridlewood",
    ]

    BLUE_LINE_ORDER = [
        "69 Street SW",
        "Sirocco",
        "45 Street SW",
        "Westbrook",
        "Shaganappi Point",
        "Sunalta",
        "Downtown West - Kerby",
        "8th Street SW",
        "7th Street SW",
        "6th Street SW",
        "4th Street SW",
        "3rd Street SW",
        "1st Street SW",
        "Centre Street",
        "City Hall",
        "Bridgeland",
        "Zoo",
        "Barlow/Max Bell",
        "Franklin",
        "Marlborough",
        "Rundle",
        "Whitehorn",
        "McKnight Westwinds",
        "Martindale",
        "Saddletowne",
    ]

    order_list = RED_LINE_ORDER if line.upper() == "RED" else BLUE_LINE_ORDER

    def get_station_order(station_name: str) -> int:
        """Get the order index for a station name"""
        station_lower = station_name.lower()
        for i, known_name in enumerate(order_list):
            known_lower = known_name.lower()
            if (
                known_lower in station_lower
                or station_lower in known_lower
                or station_lower.replace(" station", "") == known_lower
            ):
                return i
        return 999

    sorted_stations = sorted(
        stations, key=lambda s: get_station_order(s.get("stationnam", ""))
    )

    return sorted_stations


async def get_lrt_stations_geojson() -> GeoJSONFeatureCollection:
    """Fetch LRT station locations with specific fields (UNSORTED)"""
    try:
        data = await make_api_request(LRT_STATIONS_API, params={"$limit": 100})

        print(f"DEBUG: Retrieved {len(data) if data else 0} records from API")

        features = []
        for station in data:
            geom = None
            geometry_fields = ["the_geom", "point", "location", "geometry"]

            for field in geometry_fields:
                if field in station and isinstance(station[field], dict):
                    geom = station[field]
                    break

            if not geom or "coordinates" not in geom:
                continue

            station_name = ""
            name_fields = ["stationnam", "name", "station_name", "stop_name", "title"]

            for field in name_fields:
                if field in station:
                    station_name = station[field]
                    break

            leg = station.get("leg", "")
            direction = station.get("direction", "")
            route = station.get("route", "")

            line_name = ""
            if route == "201":
                line_name = "RED"
            elif route == "202":
                line_name = "BLUE"
            elif route in ["201/202", "202/201"]:
                line_name = "RED/BLUE"

            features.append(
                GeoJSONFeature(
                    geometry=Geometry(
                        type="Point",
                        coordinates=[
                            float(geom["coordinates"][0]),
                            float(geom["coordinates"][1]),
                        ],
                    ),
                    properties={
                        "name": station_name,
                        "stationnam": station_name,
                        "leg": leg,
                        "direction": direction,
                        "route": route,
                        "line": line_name,
                        "type": "LRT_STATION",
                    },
                )
            )

        print(f"DEBUG: Created {len(features)} features (unsorted)")
        return GeoJSONFeatureCollection(features=features)

    except Exception as e:
        print(f"Error fetching LRT stations: {str(e)}")
        import traceback

        traceback.print_exc()
        return GeoJSONFeatureCollection(features=[])


def deduplicate_stations(stations: List[Dict]) -> List[Dict]:
    """
    Remove duplicate stations while keeping the first occurrence
    Uses station name as the key for deduplication
    """
    seen_names = set()
    unique_stations = []

    for station in stations:
        station_name = station.get("stationnam", "")

        normalized_name = station_name.lower().replace(" station", "").strip()

        if normalized_name and normalized_name not in seen_names:
            seen_names.add(normalized_name)
            unique_stations.append(station)
        else:
            route = station.get("route", "")
            leg = station.get("leg", "")
            print(f"  Skipping duplicate: {station_name} (route: {route}, leg: {leg})")

    return unique_stations


async def get_lrt_stations_sorted_geojson(
    line: Optional[str] = None,
) -> GeoJSONFeatureCollection:
    """Fetch LRT stations sorted in proper route order (DEDUPLICATED)"""
    try:
        data = await make_api_request(LRT_STATIONS_API, params={"$limit": 100})

        print(f"DEBUG: Retrieved {len(data) if data else 0} records for sorting")

        filtered_data = []
        if line and line.upper() in ["RED", "BLUE"]:
            target_route = "201" if line.upper() == "RED" else "202"
            for station in data:
                route = station.get("route", "")
                if route == target_route or "/" in route:
                    filtered_data.append(station)
        else:
            filtered_data = data

        print(f"DEBUG: Filtered to {len(filtered_data)} stations")

        filtered_data = deduplicate_stations(filtered_data)
        print(f"DEBUG: After deduplication: {len(filtered_data)} stations")

        if line and line.upper() in ["RED", "BLUE"]:
            try:
                sorted_stations = sort_stations_by_known_order(
                    filtered_data, line.upper()
                )
                print(f"Using known order for {line} line")
            except:
                sorted_stations = sort_stations_geographically(
                    filtered_data, line.upper()
                )
                print(f"Using geographic sorting for {line} line")
        else:
            red_stations = [
                s
                for s in filtered_data
                if s.get("route") == "201" or "/" in s.get("route", "")
            ]
            blue_stations = [
                s
                for s in filtered_data
                if s.get("route") == "202" or "/" in s.get("route", "")
            ]

            red_stations = deduplicate_stations(red_stations)
            blue_stations = deduplicate_stations(blue_stations)

            sorted_red = sort_stations_by_known_order(red_stations, "RED")
            sorted_blue = sort_stations_by_known_order(blue_stations, "BLUE")

            sorted_stations = sorted_red + sorted_blue

        features = []
        for station in sorted_stations:
            geom = None
            geometry_fields = ["the_geom", "point", "location", "geometry"]

            for field in geometry_fields:
                if field in station and isinstance(station[field], dict):
                    geom = station[field]
                    break

            if not geom or "coordinates" not in geom:
                continue

            station_name = ""
            name_fields = ["stationnam", "name", "station_name", "stop_name", "title"]

            for field in name_fields:
                if field in station:
                    station_name = station[field]
                    break

            leg = station.get("leg", "")
            direction = station.get("direction", "")
            route = station.get("route", "")

            line_name = ""
            if route == "201":
                line_name = "RED"
            elif route == "202":
                line_name = "BLUE"
            elif route in ["201/202", "202/201"]:
                line_name = "RED/BLUE"

            features.append(
                GeoJSONFeature(
                    geometry=Geometry(
                        type="Point",
                        coordinates=[
                            float(geom["coordinates"][0]),
                            float(geom["coordinates"][1]),
                        ],
                    ),
                    properties={
                        "name": station_name,
                        "stationnam": station_name,
                        "leg": leg,
                        "direction": direction,
                        "route": route,
                        "line": line_name,
                        "type": "LRT_STATION",
                        "order": len(features) + 1,
                    },
                )
            )

        print(
            f"DEBUG: Created {len(features)} deduplicated sorted features for line: {line or 'ALL'}"
        )
        return GeoJSONFeatureCollection(features=features)

    except Exception as e:
        print(f"Error fetching sorted LRT stations: {str(e)}")
        import traceback

        traceback.print_exc()
        return await get_lrt_stations_geojson()


async def generate_route_from_sorted_stations(
    line: Optional[str] = None,
) -> GeoJSONFeatureCollection:
    """Generate route line from sorted stations"""
    try:
        stations_data = await get_lrt_stations_sorted_geojson(line)

        if not stations_data.features:
            return GeoJSONFeatureCollection(features=[])

        coordinates = []
        line_name = "COMBINED"

        for feature in stations_data.features:
            if feature.geometry.type == "Point":
                coordinates.append(feature.geometry.coordinates)
                if len(coordinates) == 1:
                    line_name = feature.properties.get("line", "COMBINED")

        if len(coordinates) < 2:
            return GeoJSONFeatureCollection(features=[])

        feature = GeoJSONFeature(
            geometry=Geometry(
                type="LineString",
                coordinates=coordinates,
            ),
            properties={
                "line": line_name,
                "direction": "BOTH",
                "type": "LRT_ROUTE_GENERATED",
                "station_count": len(coordinates),
                "source": "sorted_stations",
            },
        )

        print(
            f"Generated route line with {len(coordinates)} points for line: {line or 'ALL'}"
        )
        return GeoJSONFeatureCollection(features=[feature])

    except Exception as e:
        print(f"Error generating route from stations: {str(e)}")
        return GeoJSONFeatureCollection(features=[])


async def get_stops_geojson() -> GeoJSONFeatureCollection:
    """Fetch all BUS transit stops and convert to GeoJSON"""
    data = await make_api_request(
        BUS_STOPS_API,
        params={
            "$limit": 10000,
            "status": "ACTIVE",
            "$select": "teleride_number,stop_name,status,point",
        },
    )

    features = []
    for stop in data:
        point = stop.get("point")
        if not point or not point.get("coordinates"):
            continue

        features.append(
            GeoJSONFeature(
                geometry=Geometry(
                    type="Point",
                    coordinates=[
                        float(point["coordinates"][0]),
                        float(point["coordinates"][1]),
                    ],
                ),
                properties={
                    "stop_id": stop.get("teleride_number"),
                    "name": stop.get("stop_name"),
                    "status": stop.get("status"),
                    "type": "BUS",
                },
            )
        )

    return GeoJSONFeatureCollection(features=features)


async def get_route_geojson(
    route_category: str, route_short_name: Optional[str] = None, status: str = "ACTIVE"
) -> GeoJSONFeatureCollection:
    """
    Fetch BUS route stops by category and convert to GeoJSON LineString
    """
    valid_categories = {"REGULAR", "EXPRESS", "SCHOOL", "BRT"}

    if route_category.upper() not in valid_categories:
        return GeoJSONFeatureCollection(features=[])

    params = {
        "$limit": 5000,
        "route_category": route_category.upper(),
        "status": status,
        "$order": "route_short_name,stop_name",
    }

    if route_short_name:
        params["route_short_name"] = route_short_name

    data = await make_api_request(BUS_ROUTES_API, params=params)

    if not data:
        return GeoJSONFeatureCollection(features=[])

    routes_dict: Dict[str, List[List[float]]] = {}

    for stop in data:
        point = stop.get("point")
        if not point or not point.get("coordinates"):
            continue

        route_key = stop.get("route_short_name", "unknown")
        if route_key not in routes_dict:
            routes_dict[route_key] = []

        routes_dict[route_key].append(
            [
                float(point["coordinates"][0]),
                float(point["coordinates"][1]),
            ]
        )

    features = []
    for route_name, coordinates in routes_dict.items():
        if len(coordinates) >= 2:
            features.append(
                GeoJSONFeature(
                    geometry=Geometry(
                        type="LineString",
                        coordinates=coordinates,
                    ),
                    properties={
                        "route_category": route_category,
                        "route_short_name": route_name,
                        "route_long_name": next(
                            (
                                s.get("route_long_name", "")
                                for s in data
                                if s.get("route_short_name") == route_name
                            ),
                            "",
                        ),
                        "stop_count": len(coordinates),
                        "type": "BUS",
                    },
                )
            )

    return GeoJSONFeatureCollection(features=features)


async def get_lrt_routes_geojson(
    line: Optional[str] = None,
) -> GeoJSONFeatureCollection:
    """Fetch LRT route geometries (track paths) from public API"""
    params = {"$limit": 100}
    if line:
        params["line"] = line.upper()

    data = await make_api_request(LRT_ROUTES_API, params=params)

    features = []
    for route in data:
        shape = route.get("shape")
        if not shape or not shape.get("coordinates"):
            continue

        coordinates = shape["coordinates"]

        features.append(
            GeoJSONFeature(
                geometry=Geometry(
                    type="LineString",
                    coordinates=coordinates,
                ),
                properties={
                    "line": route.get("line"),
                    "direction": route.get("direction"),
                    "type": "LRT_ROUTE",
                    "api_source": "public",
                },
            )
        )

    if not features:
        print(
            f"No pre-defined routes found for {line or 'all lines'}, generating from stations..."
        )
        return await generate_route_from_sorted_stations(line)

    return GeoJSONFeatureCollection(features=features)


async def get_lrt_routes_new_api(
    line: Optional[str] = None,
) -> GeoJSONFeatureCollection:
    """
    Fetch LRT route data from the new API endpoint requiring app token
    """
    if not settings.calgary_app_token:
        raise ValueError("Calgary app token is not configured")

    headers = {"X-App-Token": settings.calgary_app_token, "Accept": "application/json"}

    params = {"$limit": 1000, "$offset": 0}

    if line:
        params["$where"] = f"line='{line.upper()}'"

    try:
        data = await make_api_request(
            settings.lrt_routes_new_api, headers=headers, params=params
        )

        features = []

        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            items = data.get("data", [])

            if not items:
                items = data.get("results", [])
            if not items:
                items = data.get("features", [])

        for item in items:
            geometry_data = None

            for field in ["shape", "geometry", "point", "the_geom"]:
                if field in item:
                    geometry_data = item[field]
                    break

            if not geometry_data:
                continue

            coordinates = []

            if isinstance(geometry_data, dict):
                if "coordinates" in geometry_data:
                    coordinates = geometry_data["coordinates"]
                elif "geometry" in geometry_data:
                    coordinates = geometry_data.get("geometry", {}).get(
                        "coordinates", []
                    )

            if not coordinates or len(coordinates) < 2:
                continue

            properties = {
                "type": "LRT_ROUTE",
                "api_source": "new_api",
                "line": item.get("line"),
                "direction": item.get("direction"),
            }

            features.append(
                GeoJSONFeature(
                    geometry=Geometry(
                        type="LineString",
                        coordinates=coordinates,
                    ),
                    properties=properties,
                )
            )

        return GeoJSONFeatureCollection(features=features)

    except Exception as e:
        print(f"Error fetching from new LRT API: {str(e)}")
        print("Falling back to public LRT API")
        return await get_lrt_routes_geojson(line)


async def get_lrt_tracks_from_gtfs(
    line: Optional[str] = None,
) -> GeoJSONFeatureCollection:
    """
    Get actual C-Train track geometry from GTFS shapes.txt
    This provides the real track paths that trains follow.
    """
    try:
        # Ensure GTFS data is downloaded
        await download_static_gtfs()

        # Read shapes and trips
        shapes_df = pd.read_csv(GTFS_DATA_DIR / "shapes.txt")
        trips_df = pd.read_csv(GTFS_DATA_DIR / "trips.txt")

        # Filter for C-Train routes (201 = Red, 202 = Blue)
        ctrain_routes = ["201", "202"]
        if line:
            if line.upper() == "RED":
                ctrain_routes = ["201"]
            elif line.upper() == "BLUE":
                ctrain_routes = ["202"]

        # Get shape_ids used by C-Train routes
        ctrain_trips = trips_df[
            trips_df["route_id"]
            .astype(str)
            .str.startswith(tuple(f"{r}-" for r in ctrain_routes))
        ]

        # Get unique shape_ids per route
        route_shapes = {}
        for route_id in ctrain_routes:
            route_trips = ctrain_trips[
                ctrain_trips["route_id"].astype(str).str.startswith(f"{route_id}-")
            ]
            shape_ids = route_trips["shape_id"].unique()
            route_shapes[route_id] = shape_ids

        features = []
        processed_shapes = set()

        for route_id, shape_ids in route_shapes.items():
            line_name = "RED" if route_id == "201" else "BLUE"

            # Find the longest shape for each direction (most complete track)
            direction_shapes = {0: None, 1: None}
            direction_lengths = {0: 0, 1: 0}

            for shape_id in shape_ids:
                if shape_id in processed_shapes:
                    continue

                shape_points = shapes_df[shapes_df["shape_id"] == shape_id].sort_values(
                    "shape_pt_sequence"
                )

                if len(shape_points) > 0:
                    # Get direction from trips
                    trip_with_shape = (
                        ctrain_trips[ctrain_trips["shape_id"] == shape_id].iloc[0]
                        if len(ctrain_trips[ctrain_trips["shape_id"] == shape_id]) > 0
                        else None
                    )
                    direction = (
                        int(trip_with_shape["direction_id"])
                        if trip_with_shape is not None
                        else 0
                    )

                    if len(shape_points) > direction_lengths[direction]:
                        direction_lengths[direction] = len(shape_points)
                        direction_shapes[direction] = shape_id

            # Create features for each direction's best shape
            for direction, shape_id in direction_shapes.items():
                if shape_id is None or shape_id in processed_shapes:
                    continue

                processed_shapes.add(shape_id)
                shape_points = shapes_df[shapes_df["shape_id"] == shape_id].sort_values(
                    "shape_pt_sequence"
                )

                # Convert to [lng, lat] format for GeoJSON
                coordinates = [
                    [row["shape_pt_lon"], row["shape_pt_lat"]]
                    for _, row in shape_points.iterrows()
                ]

                if len(coordinates) < 2:
                    continue

                features.append(
                    GeoJSONFeature(
                        geometry=Geometry(
                            type="LineString",
                            coordinates=coordinates,
                        ),
                        properties={
                            "line": line_name,
                            "route_id": route_id,
                            "direction": (
                                "Northbound/Westbound"
                                if direction == 0
                                else "Southbound/Eastbound"
                            ),
                            "type": "LRT_TRACK",
                            "source": "gtfs_shapes",
                            "shape_id": str(shape_id),
                            "point_count": len(coordinates),
                        },
                    )
                )

        print(f"📍 Generated {len(features)} C-Train track features from GTFS shapes")
        return GeoJSONFeatureCollection(features=features)

    except Exception as e:
        print(f"❌ Error loading GTFS shapes: {str(e)}")
        # Fallback to generated routes
        return await generate_route_from_sorted_stations(line)
