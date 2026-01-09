"""
Calgary Transit API v3.0
Clean architecture with proper GTFS data handling
"""

from datetime import datetime
from typing import Optional

import uvicorn
from config import settings
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from services.arrivals_service import (
    get_all_ctrain_arrivals,
    get_nearby_stops_with_arrivals,
    get_route_schedule,
    get_station_arrivals,
    get_stop_arrivals,
)

# Import legacy services for backwards compatibility
from services.calgary_transit import (
    get_lrt_stations_geojson,
    get_lrt_stations_sorted_geojson,
    get_lrt_tracks_from_gtfs,
    get_stops_geojson,
    get_stops_with_routes_geojson,
)

# Import new services
from services.gtfs_service import (
    download_static_gtfs,
    get_all_routes,
    get_all_stops,
    get_cache_stats,
    get_realtime_arrivals,
    get_route,
    get_route_shape,
    get_routes_serving_stop,
    get_stop,
    get_vehicle_positions,
    is_loaded,
    load_gtfs_static,
)
from services.trip_service import (
    find_nearby_stops,
    geocode_location,
    plan_trip,
)
from services.ctrain_interpolation import get_interpolated_ctrain_positions

app = FastAPI(
    title="Calgary Transit API",
    version="3.0.0",
    description="Real-time transit data and trip planning for Calgary Transit",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    """Initialize GTFS data on startup"""
    print("🚀 Starting Calgary Transit API v3.0...")

    # Download GTFS if needed
    await download_static_gtfs()

    # Load GTFS data into memory
    load_gtfs_static()

    print("✅ API ready!")


@app.get("/")
async def root():
    """API root with available endpoints"""
    return {
        "name": "Calgary Transit API",
        "version": "3.0.0",
        "status": "ready" if is_loaded() else "loading",
        "endpoints": {
            # Real-time arrivals (like Transit app)
            "stop_arrivals": "/arrivals/{stop_id}",
            "nearby_arrivals": "/arrivals/nearby",
            "station_arrivals": "/arrivals/station/{station_name}",
            # Vehicle tracking
            "ctrains": "/vehicles/ctrains",
            "buses": "/vehicles/buses",
            # Trip planning
            "plan_trip": "/trip/plan",
            "geocode": "/geocode",
            "nearby_stops": "/stops/nearby",
            # Static data
            "all_stops": "/stops",
            "all_routes": "/routes",
            "lrt_tracks": "/lrt/tracks",
            "lrt_stations": "/lrt/stations",
            # System
            "health": "/health",
            "cache_stats": "/stats",
        },
    }


# ============================================
# Real-Time Arrivals (Transit App Style)
# ============================================

# NOTE: Static paths must come BEFORE dynamic paths like {stop_id}
# Otherwise /arrivals/nearby would match /arrivals/{stop_id} with stop_id="nearby"


@app.get("/arrivals/nearby")
async def arrivals_nearby(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    radius: float = Query(500, description="Search radius in meters"),
    limit_stops: int = Query(5, description="Maximum stops to return"),
    limit_arrivals: int = Query(3, description="Arrivals per stop"),
    vehicle_type: Optional[str] = Query(None, description="Filter: CTrain or Bus"),
):
    """
    Get nearby stops with their upcoming arrivals.
    Like the Transit app home screen.
    """
    try:
        return await get_nearby_stops_with_arrivals(
            latitude=lat,
            longitude=lng,
            radius_meters=radius,
            limit_stops=limit_stops,
            limit_arrivals_per_stop=limit_arrivals,
            vehicle_type_filter=vehicle_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/arrivals/station/{station_name:path}")
async def arrivals_for_station(
    station_name: str,
    line: Optional[str] = Query(None, description="Filter by line: Red or Blue"),
    limit: int = Query(10, description="Maximum arrivals"),
):
    """
    Get arrivals for a CTrain station by name.
    Convenience endpoint for LRT stations.
    """
    try:
        result = await get_station_arrivals(
            station_name=station_name,
            line=line,
            limit=limit,
        )

        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/arrivals/{stop_id}")
async def arrivals_for_stop(
    stop_id: str,
    limit: int = Query(10, description="Maximum arrivals to return"),
    route: Optional[str] = Query(
        None, description="Filter by route (e.g., '201', '3')"
    ),
    vehicle_type: Optional[str] = Query(
        None, description="Filter by type: CTrain or Bus"
    ),
):
    """
    Get real-time arrivals for a specific stop.
    This is the core "when is my bus/train coming?" endpoint.
    """
    try:
        result = await get_stop_arrivals(
            stop_id=stop_id,
            limit=limit,
            route_filter=route,
            vehicle_type_filter=vehicle_type,
        )

        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Vehicle Tracking
# ============================================


@app.get("/vehicles/ctrains")
async def get_ctrains(
    line: Optional[str] = Query(None, description="Filter by line: Red or Blue"),
    source: Optional[str] = Query(None, description="Data source: gps, interpolated, or auto (default)"),
):
    """
    Get real-time CTrain positions.
    
    Note: Calgary Transit doesn't publish CTrain GPS positions in their GTFS-RT feed.
    By default, we use interpolated positions calculated from trip updates and track geometry.
    
    Source options:
    - auto (default): Use GPS if available, fallback to interpolated
    - gps: Only use GPS positions (may return empty)
    - interpolated: Only use interpolated positions
    """
    try:
        use_gps = source in [None, "auto", "gps"]
        use_interpolated = source in [None, "auto", "interpolated"]
        
        vehicles = []
        data_source = None
        
        # Try GPS positions first
        if use_gps:
            vehicles = await get_vehicle_positions(vehicle_type="CTrain", line=line)
            if vehicles:
                data_source = "gps"
        
        # Fallback to interpolated positions
        if not vehicles and use_interpolated:
            vehicles = await get_interpolated_ctrain_positions(line=line)
            data_source = "interpolated"
        
        return {
            "count": len(vehicles),
            "line_filter": line,
            "data_source": data_source,
            "vehicles": vehicles,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/vehicles/buses")
async def get_buses(
    route: Optional[str] = Query(None, description="Filter by route number"),
):
    """Get real-time bus positions"""
    try:
        vehicles = await get_vehicle_positions(vehicle_type="Bus", route_id=route)

        return {
            "count": len(vehicles),
            "route_filter": route,
            "vehicles": vehicles,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/vehicles")
async def get_all_vehicles(
    vehicle_type: Optional[str] = Query(None, description="CTrain or Bus"),
    route: Optional[str] = Query(None, description="Route ID or number"),
):
    """Get all real-time vehicle positions"""
    try:
        vehicles = await get_vehicle_positions(
            vehicle_type=vehicle_type,
            route_id=route,
        )

        return {
            "count": len(vehicles),
            "filters": {
                "vehicle_type": vehicle_type,
                "route": route,
            },
            "vehicles": vehicles,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Trip Planning
# ============================================


@app.get("/trip/plan")
async def trip_plan_endpoint(
    origin_lng: float = Query(..., description="Origin longitude"),
    origin_lat: float = Query(..., description="Origin latitude"),
    dest_lng: float = Query(..., description="Destination longitude"),
    dest_lat: float = Query(..., description="Destination latitude"),
    prefer_lrt: bool = Query(True, description="Prefer CTrain routes"),
    leave_time: Optional[int] = Query(None, description="Unix timestamp for departure"),
    arrive_by: Optional[int] = Query(None, description="Unix timestamp for arrival"),
    accessibility: str = Query("none", description="Accessibility preference: none, strict, or prioritize_step_free"),
):
    """
    Plan a transit trip from origin to destination.
    
    Uses Transit API if configured, falls back to GTFS-based routing.
    Returns walking and transit segments.
    """
    try:
        result = await plan_trip(
            origin=(origin_lng, origin_lat),
            destination=(dest_lng, dest_lat),
            prefer_lrt=prefer_lrt,
            leave_time=leave_time,
            arrive_by=arrive_by,
            accessibility=accessibility,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/trip/plan")
async def trip_plan_post(
    origin_lng: float = Query(..., description="Origin longitude"),
    origin_lat: float = Query(..., description="Origin latitude"),
    dest_lng: float = Query(..., description="Destination longitude"),
    dest_lat: float = Query(..., description="Destination latitude"),
    prefer_lrt: bool = Query(True, description="Prefer CTrain routes"),
    leave_time: Optional[int] = Query(None, description="Unix timestamp for departure"),
    arrive_by: Optional[int] = Query(None, description="Unix timestamp for arrival"),
    accessibility: str = Query("none", description="Accessibility preference: none, strict, or prioritize_step_free"),
):
    """Plan a transit trip (POST version)"""
    return await trip_plan_endpoint(
        origin_lng=origin_lng,
        origin_lat=origin_lat,
        dest_lng=dest_lng,
        dest_lat=dest_lat,
        prefer_lrt=prefer_lrt,
        leave_time=leave_time,
        arrive_by=arrive_by,
        accessibility=accessibility,
    )


@app.get("/geocode")
async def geocode_endpoint(
    q: str = Query(..., description="Address or place to search"),
    proximity_lng: Optional[float] = Query(
        None, description="Longitude for proximity bias"
    ),
    proximity_lat: Optional[float] = Query(
        None, description="Latitude for proximity bias"
    ),
):
    """Geocode an address or place name"""
    try:
        proximity = None
        if proximity_lng and proximity_lat:
            proximity = (proximity_lng, proximity_lat)

        results = await geocode_location(q, proximity)
        return {
            "query": q,
            "results": results,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stops/nearby")
async def nearby_stops_endpoint(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    radius: float = Query(1000, description="Search radius in meters"),
    limit: int = Query(10, description="Maximum stops"),
    vehicle_type: Optional[str] = Query(None, description="CTrain or Bus"),
):
    """Find transit stops near a location"""
    try:
        stops = find_nearby_stops(
            latitude=lat,
            longitude=lng,
            radius_meters=radius,
            limit=limit,
            vehicle_type=vehicle_type,
        )
        return {
            "location": {"lat": lat, "lng": lng},
            "radius_meters": radius,
            "stops": stops,
            "count": len(stops),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Static Data
# ============================================


@app.get("/stops")
async def all_stops(
    transit_type: str = Query("BUS", description="BUS or LRT"),
    with_routes: bool = Query(False, description="Include route info"),
):
    """Get all transit stops"""
    try:
        if transit_type.upper() == "LRT":
            return await get_lrt_stations_geojson()
        elif with_routes:
            return await get_stops_with_routes_geojson()
        else:
            return await get_stops_geojson()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stops/{stop_id}")
async def stop_detail(stop_id: str):
    """Get details for a specific stop"""
    stop = get_stop(stop_id)
    if not stop:
        raise HTTPException(status_code=404, detail=f"Stop {stop_id} not found")

    routes = get_routes_serving_stop(stop_id)

    return {
        "stop": stop,
        "routes": routes,
    }


@app.get("/routes")
async def all_routes():
    """Get all transit routes"""
    routes = get_all_routes()

    # Group by vehicle type
    ctrains = [r for r in routes if r.get("vehicle_type") == "CTrain"]
    buses = [r for r in routes if r.get("vehicle_type") == "Bus"]

    return {
        "total": len(routes),
        "ctrain": {
            "count": len(ctrains),
            "routes": ctrains,
        },
        "bus": {
            "count": len(buses),
            "routes": sorted(buses, key=lambda r: r.get("route_short_name", "")),
        },
    }


@app.get("/routes/{route_id}")
async def route_detail(route_id: str):
    """Get details for a specific route"""
    route = get_route(route_id)
    if not route:
        raise HTTPException(status_code=404, detail=f"Route {route_id} not found")

    # Get schedule/arrivals
    schedule = await get_route_schedule(route_id)

    return {
        "route": route,
        **schedule,
    }


@app.get("/routes/{route_id}/shape")
async def route_shape(
    route_id: str,
    direction: Optional[int] = Query(None, description="Direction ID (0 or 1)"),
):
    """
    Get the shape/geometry for a specific route as GeoJSON.
    Useful for drawing route lines on a map.
    """
    shape = get_route_shape(route_id, direction)
    if not shape:
        raise HTTPException(status_code=404, detail=f"Shape for route {route_id} not found")
    return shape


# ============================================
# LRT Specific Endpoints
# ============================================


@app.get("/lrt/stations")
async def lrt_stations():
    """Get all LRT stations"""
    try:
        return await get_lrt_stations_geojson()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/lrt/stations/sorted")
async def lrt_stations_sorted(
    line: Optional[str] = Query(None, description="RED or BLUE"),
):
    """Get LRT stations in route order"""
    try:
        return await get_lrt_stations_sorted_geojson(line.upper() if line else None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/lrt/tracks")
async def lrt_tracks(
    line: Optional[str] = Query(None, description="RED or BLUE"),
):
    """Get LRT track geometry"""
    try:
        return await get_lrt_tracks_from_gtfs(line)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/lrt/arrivals")
async def lrt_arrivals(
    line: Optional[str] = Query(None, description="RED or BLUE"),
):
    """Get all CTrain arrivals across the network"""
    try:
        return await get_all_ctrain_arrivals(line)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# System Endpoints
# ============================================


@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "healthy" if is_loaded() else "loading",
        "gtfs_loaded": is_loaded(),
        "mapbox_configured": bool(settings.mapbox_access_token),
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/stats")
async def stats():
    """Cache and system statistics"""
    return get_cache_stats()


# ============================================
# Legacy Endpoints (for backwards compatibility)
# ============================================


@app.get("/ctrains")
async def legacy_ctrains(
    line: Optional[str] = Query(None, description="RED or BLUE"),
):
    """Legacy endpoint - use /vehicles/ctrains instead"""
    return await get_ctrains(line=line)


@app.get("/buses")
async def legacy_buses(
    route_id: Optional[str] = Query(None),
):
    """Legacy endpoint - use /vehicles/buses instead"""
    return await get_buses(route=route_id)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
