import os
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    calgary_app_token: Optional[str] = None
    mapbox_access_token: Optional[str] = None
    transit_api_key: Optional[str] = None 
    google_api_key: Optional[str] = None

    lrt_routes_new_api: str = (
        "https://data.calgary.ca/api/v3/views/2axz-xm4q/query.json"
    )

    # Other settings
    debug: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()


def print_config_status():
    """Print configuration status"""
    print("=" * 50)
    print("Calgary Transit API Configuration")
    print("=" * 50)
    print(
        f"App Token Configured: {'✅ Yes' if settings.calgary_app_token else '❌ No'}"
    )
    print(
        f"Mapbox Token Configured: {'✅ Yes' if settings.mapbox_access_token else '❌ No'}"
    )
    print(f"Debug Mode: {'✅ On' if settings.debug else '❌ Off'}")
    print("=" * 50)

    if not settings.calgary_app_token:
        print("\n⚠️  WARNING: CALGARY_APP_TOKEN not set in environment variables")
        print("The new LRT API endpoint will not work without an app token.")

    if not settings.mapbox_access_token:
        print("\n⚠️  WARNING: MAPBOX_ACCESS_TOKEN not set in environment variables")
        print("Trip planning with geocoding will not work without a Mapbox token.")
        print("Create a .env file with MAPBOX_ACCESS_TOKEN=your_token_here")


# Print status when module is loaded
print_config_status()
