"""
Google Directions API Service
Provides high-quality transit routing with accurate polylines
"""

import httpx
from typing import Dict, List, Optional, Tuple
from config import settings


def decode_google_polyline(encoded: str) -> List[List[float]]:
    """
    Decode a Google encoded polyline string into a list of [lon, lat] coordinates.
    """
    if not encoded:
        return []
    
    coordinates = []
    index = 0
    lat = 0
    lng = 0
    
    while index < len(encoded):
        # Decode latitude
        shift = 0
        result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        
        dlat = ~(result >> 1) if result & 1 else result >> 1
        lat += dlat
        
        # Decode longitude
        shift = 0
        result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        
        dlng = ~(result >> 1) if result & 1 else result >> 1
        lng += dlng
        
        # Google uses lat/lng * 1e5, convert to [lon, lat] for GeoJSON
        coordinates.append([lng / 1e5, lat / 1e5])
    
    return coordinates


async def get_google_transit_directions(
    origin: Tuple[float, float],
    destination: Tuple[float, float],
    departure_time: Optional[int] = None
) -> Optional[Dict]:
    """
    Get transit directions from Google Directions API.
    Returns geometry and steps for the route.
    
    Args:
        origin: (lat, lng) tuple
        destination: (lat, lng) tuple
        departure_time: Unix timestamp for departure (optional)
    
    Returns:
        Dict with geometry (GeoJSON LineString) and route details
    """
    if not settings.google_api_key:
        print("❌ Google API key not configured")
        return None
    
    url = "https://maps.googleapis.com/maps/api/directions/json"
    
    params = {
        "origin": f"{origin[0]},{origin[1]}",
        "destination": f"{destination[0]},{destination[1]}",
        "mode": "transit",
        "key": settings.google_api_key,
    }
    
    if departure_time:
        params["departure_time"] = departure_time
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, params=params)
            data = response.json()
            
            if data.get("status") != "OK":
                print(f"❌ Google Directions API error: {data.get('status')}")
                return None
            
            routes = data.get("routes", [])
            if not routes:
                print("❌ Google API returned no routes")
                return None
            
            route = routes[0]
            legs = route.get("legs", [])
            
            # Log the response details
            print(f"\n🔍 GOOGLE DIRECTIONS API RESPONSE:")
            print(f"   Status: {data.get('status')}")
            print(f"   Num routes: {len(routes)}")
            if legs:
                leg = legs[0]
                print(f"   Duration: {leg.get('duration', {}).get('text')}")
                print(f"   Distance: {leg.get('distance', {}).get('text')}")
                print(f"   Start: {leg.get('start_address')}")
                print(f"   End: {leg.get('end_address')}")
                print(f"   Num steps: {len(leg.get('steps', []))}")
                for i, step in enumerate(leg.get("steps", [])):
                    travel_mode = step.get("travel_mode")
                    transit_details = step.get("transit_details", {})
                    if transit_details:
                        line = transit_details.get("line", {})
                        print(f"      Step {i}: {travel_mode} - {line.get('short_name')} {line.get('name')} towards {transit_details.get('headsign')}")
                    else:
                        print(f"      Step {i}: {travel_mode} - {step.get('html_instructions', '')[:50]}...")
            
            # Extract ONLY TRANSIT step geometries (NOT walking)
            # This gives us the actual train/bus route, not walking paths
            transit_coordinates = []
            transit_headsign = None
            transit_line_name = None
            transit_line_short = None
            
            for leg in legs:
                for step in leg.get("steps", []):
                    travel_mode = step.get("travel_mode", "")
                    
                    # Only include TRANSIT steps, skip WALKING
                    if travel_mode == "TRANSIT":
                        step_polyline = step.get("polyline", {}).get("points", "")
                        step_coords = decode_google_polyline(step_polyline)
                        transit_coordinates.extend(step_coords)
                        
                        # Also extract headsign from transit details
                        transit_details = step.get("transit_details", {})
                        if transit_details and not transit_headsign:
                            transit_headsign = transit_details.get("headsign")
                            line_info = transit_details.get("line", {})
                            transit_line_name = line_info.get("name")
                            transit_line_short = line_info.get("short_name")
            
            # Get overview as fallback
            overview_polyline = route.get("overview_polyline", {}).get("points", "")
            full_coordinates = decode_google_polyline(overview_polyline)
            
            # Use transit-only coordinates if available, otherwise fall back to full route
            if transit_coordinates:
                coordinates = transit_coordinates
                print(f"   ✅ Using TRANSIT-ONLY geometry: {len(coordinates)} pts")
            else:
                coordinates = full_coordinates
                print(f"   ⚠️ No transit steps found, using full route: {len(coordinates)} pts")
            
            if not coordinates:
                print("❌ No coordinates decoded from polyline")
                return None
            
            print(f"   Total coordinates: {len(coordinates)}")
            print(f"   First: {coordinates[0] if coordinates else 'N/A'}")
            print(f"   Last: {coordinates[-1] if coordinates else 'N/A'}\n")
            
            return {
                "geometry": {
                    "type": "LineString",
                    "coordinates": coordinates
                },
                "duration": legs[0].get("duration", {}).get("value", 0) if legs else 0,
                "distance": legs[0].get("distance", {}).get("value", 0) if legs else 0,
                "transit_headsign": transit_headsign,
                "transit_line_name": transit_line_name,
                "transit_line_short": transit_line_short,
            }
            
    except Exception as e:
        print(f"❌ Error calling Google Directions API: {e}")
        return None


async def get_google_transit_segment_geometry(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float
) -> Optional[Dict]:
    """
    Get geometry and transit details for a segment.
    Returns dict with geometry and transit_headsign if available.
    """
    result = await get_google_transit_directions(
        origin=(start_lat, start_lon),
        destination=(end_lat, end_lon)
    )
    
    if result and result.get("geometry"):
        return {
            "geometry": result["geometry"],
            "transit_headsign": result.get("transit_headsign"),
            "transit_line_name": result.get("transit_line_name"),
            "transit_line_short": result.get("transit_line_short"),
        }
    
    return None
