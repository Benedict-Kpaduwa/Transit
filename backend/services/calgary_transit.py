from typing import Any, Dict, List, Optional

import httpx
from config import settings
from models.geo import GeoJSONFeature, GeoJSONFeatureCollection, Geometry

BUS_STOPS_API = "https://data.calgary.ca/resource/muzh-c9qc.json"
BUS_ROUTES_API = "https://data.calgary.ca/resource/pm3p-838w.json"

LRT_STATIONS_API = "https://data.calgary.ca/resource/2axz-xm4q.json"
LRT_ROUTES_API = "https://data.calgary.ca/resource/2wti-eh59.json"


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

    # Choose the correct order list
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
                s for s in filtered_data 
                if s.get("route") == "201" or "/" in s.get("route", "")
            ]
            blue_stations = [
                s for s in filtered_data 
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
        # Get sorted stations
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
