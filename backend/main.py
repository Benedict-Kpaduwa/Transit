from datetime import datetime
from typing import Optional

from config import settings
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from fastapi_cache.decorator import cache
from models.geo import GeoJSONFeatureCollection
from services.calgary_transit import (
    generate_route_from_sorted_stations,
    get_lrt_routes_geojson,
    get_lrt_routes_new_api,
    get_lrt_stations_geojson,
    get_lrt_stations_sorted_geojson,
    get_lrt_tracks_from_gtfs,
    get_realtime_bus_positions_with_routes,
    get_realtime_ctrain_positions_with_routes,
    get_realtime_trip_updates,
    get_route_geojson,
    get_stops_geojson,
    get_vehicles_geojson,
)

app = FastAPI(title="Calgary Transit API", version="2.0.0")


@app.on_event("startup")
async def startup():
    FastAPICache.init(InMemoryBackend(), prefix="fastapi-cache")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "message": "Calgary Transit API",
        "version": "2.0.0",
        "has_app_token": bool(settings.calgary_app_token),
        "endpoints": {
            "all_stops": "/stops",
            "bus_routes": "/map/routes/{category}",
            "lrt_stations": "/lrt/stations",
            "lrt_stations_sorted": "/lrt/stations/sorted",
            "lrt_routes": "/lrt/routes",
            "lrt_routes_generated": "/lrt/routes/generated",
            "lrt_tracks": "/lrt/tracks (actual track geometry from GTFS)",
            "lrt_by_line": "/lrt/stations/by-line/{line}",
            "lrt_sorted_by_line": "/lrt/stations/sorted/{line}",
            "health": "/health",
        },
    }


# C-Train endpoints
@app.get("/ctrains")
async def get_ctrains(
    line: Optional[str] = Query(None, description="C-Train line: RED or BLUE")
):
    """Get real-time C-Train positions"""
    try:
        ctrains = await get_realtime_ctrain_positions_with_routes(line=line)

        return {
            "total": len(ctrains),
            "line": line.upper() if line else "ALL",
            "ctrains": ctrains,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ctrains/geojson")
async def get_ctrains_geojson_endpoint(
    line: Optional[str] = Query(None, description="C-Train line: RED or BLUE")
):
    """Get real-time C-Train positions as GeoJSON"""
    try:
        ctrains = await get_realtime_ctrain_positions_with_routes(line=line)

        features = []
        for ctrain in ctrains:
            position = ctrain.get("position", {})
            lat = position.get("latitude")
            lon = position.get("longitude")

            if lat is not None and lon is not None:
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [lon, lat]},
                        "properties": {
                            "vehicle_id": ctrain.get("vehicle_id"),
                            "route_id": ctrain.get("route_id"),
                            "line": ctrain.get("line"),
                            "trip_id": ctrain.get("trip_id"),
                            "nearest_station": ctrain.get("nearest_station"),
                            "distance_to_station": ctrain.get("distance_to_station"),
                            "timestamp": ctrain.get("timestamp"),
                            "type": "CTRAIN",
                        },
                    }
                )

        return {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "count": len(features),
                "line": line.upper() if line else "ALL",
                "timestamp": datetime.now().isoformat(),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/buses")
async def get_buses(
    route_category: Optional[str] = Query(
        None, description="Bus category: BRT, REGULAR, EXPRESS"
    ),
    route_id: Optional[str] = Query(
        None, description="Specific route ID (e.g., 301, 1, 10)"
    ),
    debug: bool = Query(False, description="Show debug info for unmatched buses"),
):
    """Get real-time bus positions with route information from static GTFS"""
    try:
        buses = await get_realtime_bus_positions_with_routes(
            route_category=route_category, route_id=route_id, debug_unmatched=debug
        )

        return {
            "total": len(buses),
            "filters": {
                "route_category": route_category.upper() if route_category else None,
                "route_id": route_id,
            },
            "buses": buses,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/buses/geojson")
async def get_buses_geojson_endpoint(
    route_category: Optional[str] = Query(
        None, description="Bus category: BRT, REGULAR, EXPRESS"
    ),
    route_id: Optional[str] = Query(None, description="Specific route ID"),
):
    """Get real-time bus positions as GeoJSON"""
    try:
        return await get_buses_geojson(route_category=route_category, route_id=route_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/vehicles")
async def get_vehicles(
    line: Optional[str] = Query(
        None, description="C-Train line: RED or BLUE (deprecated, use /ctrains)"
    ),
    vehicle_type: Optional[str] = Query(
        None, description="CTRAIN or BUS (deprecated, use /ctrains or /buses)"
    ),
):
    """
    DEPRECATED: Use /ctrains or /buses instead
    Get real-time vehicle positions
    """
    try:
        if vehicle_type and vehicle_type.upper() == "BUS":
            return await get_buses(route_category=None, route_id=None)
        else:
            return await get_ctrains(line=line)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/trips")
async def get_trip_updates(
    line: Optional[str] = Query(None, description="RED or BLUE")
):
    """Get real-time trip updates (arrival predictions)"""
    try:
        updates = await get_realtime_trip_updates()

        if line:
            route_id = "201" if line.upper() == "RED" else "202"
            updates = [u for u in updates if u.get("route_id") == route_id]

        return {"total": len(updates), "updates": updates}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stops", response_model=GeoJSONFeatureCollection)
async def stops(
    transit_type: str = Query("BUS", description="Type of transit: BUS or LRT")
):
    """Get all transit stops as GeoJSON"""
    try:
        if transit_type.upper() == "LRT":
            return await get_lrt_stations_geojson()
        else:
            return await get_stops_geojson()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch stops: {str(e)}")


@app.get("/map/routes/{route_category}", response_model=GeoJSONFeatureCollection)
async def route(
    route_category: str,
    route_short_name: str = None,
    transit_type: str = Query("BUS", description="Type of transit: BUS or LRT"),
):
    """Get route geometry by category"""
    try:
        if transit_type.upper() == "LRT":
            return await get_lrt_routes_geojson(route_category)
        else:
            data = await get_route_geojson(route_category, route_short_name)
            if not data.features:
                raise HTTPException(
                    status_code=404,
                    detail=f"No routes found for category '{route_category}'",
                )
            return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch route data: {str(e)}"
        )


@app.get("/lrt/stations", response_model=GeoJSONFeatureCollection)
async def lrt_stations():
    """Get all LRT stations (UNSORTED - original order from API)"""
    try:
        return await get_lrt_stations_geojson()
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch LRT stations: {str(e)}"
        )


@app.get("/lrt/stations/sorted", response_model=GeoJSONFeatureCollection)
async def lrt_stations_sorted():
    """Get all LRT stations SORTED in proper route order"""
    try:
        return await get_lrt_stations_sorted_geojson()
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch sorted LRT stations: {str(e)}"
        )


@app.get("/lrt/stations/sorted/{line}", response_model=GeoJSONFeatureCollection)
async def lrt_stations_sorted_by_line(line: str):
    """Get LRT stations for a specific line, SORTED in proper route order"""
    try:
        if line.upper() not in ["RED", "BLUE"]:
            raise HTTPException(status_code=400, detail="Line must be RED or BLUE")

        return await get_lrt_stations_sorted_geojson(line.upper())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch sorted stations: {str(e)}"
        )


@app.get("/lrt/stations/by-line/{line}", response_model=GeoJSONFeatureCollection)
async def lrt_stations_by_line(line: str):
    """Get LRT stations filtered by line (RED or BLUE) - UNSORTED"""
    try:
        all_stations = await get_lrt_stations_geojson()

        if line.upper() == "RED":
            route_filter = "201"
        elif line.upper() == "BLUE":
            route_filter = "202"
        elif line.upper() in ["BOTH", "RED/BLUE", "201/202"]:
            route_filter = "201/202"
        else:
            raise HTTPException(status_code=400, detail="Invalid line. Use RED or BLUE")

        filtered_features = []
        for feature in all_stations.features:
            route = feature.properties.get("route", "")
            if route_filter == "201/202":
                if "201" in route or "202" in route:
                    filtered_features.append(feature)
            elif route == route_filter:
                filtered_features.append(feature)

        return GeoJSONFeatureCollection(features=filtered_features)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to filter stations: {str(e)}"
        )


@app.get("/lrt/routes", response_model=GeoJSONFeatureCollection)
async def lrt_routes(
    line: str = None,
    use_new_api: bool = Query(False, description="Use the new API endpoint"),
):
    """Get LRT route geometries - tries pre-defined routes first, falls back to generated"""
    try:
        if use_new_api:
            if not settings.calgary_app_token:
                raise HTTPException(
                    status_code=400,
                    detail="App token not configured. Set CALGARY_APP_TOKEN environment variable.",
                )
            return await get_lrt_routes_new_api(line)
        else:
            return await get_lrt_routes_geojson(line)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch LRT routes: {str(e)}"
        )


@app.get("/lrt/routes/generated", response_model=GeoJSONFeatureCollection)
async def lrt_routes_generated(
    line: str = None,
):
    """Get LRT route geometries GENERATED from sorted stations (always sorted)"""
    try:
        return await generate_route_from_sorted_stations(line)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate LRT routes: {str(e)}"
        )


@app.get("/lrt/tracks", response_model=GeoJSONFeatureCollection)
async def lrt_tracks(
    line: str = Query(None, description="Filter by line: RED or BLUE"),
):
    """Get actual C-Train track geometry from GTFS shapes - follows real train tracks"""
    try:
        return await get_lrt_tracks_from_gtfs(line)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch LRT tracks: {str(e)}"
        )


@app.get("/routes/categories")
async def route_categories():
    """Get available route categories"""
    return {
        "bus_categories": ["REGULAR", "EXPRESS", "SCHOOL", "BRT"],
        "lrt_lines": ["RED", "BLUE"],
        "note": "For sorted stations, use /lrt/stations/sorted endpoint",
    }


@app.get("/lrt/lines")
async def lrt_lines():
    """Get LRT line information"""
    return {
        "lines": [
            {
                "name": "RED",
                "route_number": "201",
                "description": "North-South Line: Tuscany to Somerset-Bridlewood",
                "sorting": "Stations sorted North to South",
                "endpoints": ["Tuscany Station", "Somerset-Bridlewood Station"],
            },
            {
                "name": "BLUE",
                "route_number": "202",
                "description": "West-East Line: 69 Street SW to Saddletowne",
                "sorting": "Stations sorted West to East",
                "endpoints": ["69 Street SW Station", "Saddletowne Station"],
            },
        ]
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "app_token_configured": bool(settings.calgary_app_token),
        "features": {
            "station_sorting": "enabled",
            "route_generation": "enabled",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
