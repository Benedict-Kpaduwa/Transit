from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field


class Geometry(BaseModel):
    """GeoJSON Geometry object"""

    type: str
    coordinates: List[Union[float, List[float]]]


class GeoJSONFeature(BaseModel):
    """GeoJSON Feature object"""

    type: str = "Feature"
    geometry: Geometry
    properties: Optional[Dict[str, Any]] = Field(default_factory=dict)


class GeoJSONFeatureCollection(BaseModel):
    """GeoJSON FeatureCollection object"""

    type: str = "FeatureCollection"
    features: List[GeoJSONFeature]

    class Config:
        json_schema_extra = {
            "example": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [-114.0657409, 51.0483414],
                        },
                        "properties": {
                            "stop_id": "7008",
                            "name": "EB 5 AV SW @ 1 ST SW",
                        },
                    }
                ],
            }
        }
