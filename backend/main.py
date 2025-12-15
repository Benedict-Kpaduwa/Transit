from config import settings
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from models.geo import GeoJSONFeatureCollection
from services.calgary_transit import (
    get_lrt_routes_geojson,
    get_lrt_routes_new_api,
    get_lrt_stations_geojson,
    get_route_geojson,
    get_stops_geojson,
)

app = FastAPI(title="Calgary Transit API", version="1.2.0")

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
        "version": "1.2.0",
        "has_app_token": bool(settings.calgary_app_token),
    }


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
    """Get all LRT stations"""
    try:
        return await get_lrt_stations_geojson()
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch LRT stations: {str(e)}"
        )


@app.get("/lrt/routes", response_model=GeoJSONFeatureCollection)
async def lrt_routes(
    line: str = None,
    use_new_api: bool = Query(False, description="Use the new API endpoint"),
):
    """Get LRT route geometries"""
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


@app.get("/routes/categories")
async def route_categories():
    """Get available route categories"""
    return {
        "bus_categories": ["REGULAR", "EXPRESS", "SCHOOL", "BRT"],
        "lrt_lines": ["RED", "BLUE", "GREEN"],
        "note": "For LRT new API, use use_new_api=true parameter",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "app_token_configured": bool(settings.calgary_app_token),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
