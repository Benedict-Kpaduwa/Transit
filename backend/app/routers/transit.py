from fastapi import APIRouter, HTTPException, Query
from app.services.calgary_transit import fetch_transit_data, normalize_records

router = APIRouter(prefix="/transit", tags=["Transit"])


@router.get("/raw")
async def get_raw_transit_data(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=1000),
):
    try:
        return await fetch_transit_data(page, size)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lrt")
async def get_lrt_routes(
    page: int = Query(1, ge=1),
    size: int = Query(500, ge=1, le=1000),
):
    """
    Red Line (201) and Blue Line (202) only
    """
    try:
        raw = await fetch_transit_data(page, size)
        records = normalize_records(raw)

        lrt = [
            r for r in records
            if r.get("route_short_name") in ("201", "202")
        ]

        return {
            "count": len(lrt),
            "routes": lrt,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lrt/{route_id}")
async def get_single_lrt_route(
    route_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(500, ge=1, le=1000),
):
    if route_id not in ("201", "202"):
        raise HTTPException(status_code=400, detail="Route must be 201 or 202")

    try:
        raw = await fetch_transit_data(page, size)
        records = normalize_records(raw)

        filtered = [
            r for r in records
            if r.get("route_short_name") == route_id
        ]

        return {
            "route": route_id,
            "count": len(filtered),
            "stations": filtered,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
