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


async def get_lrt_stations_geojson() -> GeoJSONFeatureCollection:
    """Fetch LRT station locations with specific fields"""
    try:
        data = await make_api_request(LRT_STATIONS_API, params={"$limit": 100})

        print(f"DEBUG: Retrieved {len(data) if data else 0} records from API")
        # print(f"DEBUG: {(data)}")

        features = []
        for index, station in enumerate(data):
            geom = None
            geometry_fields = ["the_geom", "point", "location", "geometry"]

            for field in geometry_fields:
                if field in station and isinstance(station[field], dict):
                    geom = station[field]

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

        # print(f"DEBUG: Created {len(features)} features")
        return GeoJSONFeatureCollection(features=features)

    except Exception as e:
        print(f"Error fetching LRT stations: {str(e)}")
        import traceback

        traceback.print_exc()
        return GeoJSONFeatureCollection(features=[])


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
                "raw_data_sample": {
                    k: item[k]
                    for k in list(item.keys())[:3]
                    if k not in ["shape", "geometry", "point", "the_geom"]
                },
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
