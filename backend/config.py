import os
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Calgary Open Data App Token (for new API endpoints)
    calgary_app_token: Optional[str] = None

    # API endpoints
    lrt_routes_new_api: str = (
        "https://data.calgary.ca/api/v3/views/2axz-xm4q/query.json"
    )

    # Other settings
    debug: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Create global settings instance
settings = Settings()


# Print configuration status on startup
def print_config_status():
    """Print configuration status"""
    print("=" * 50)
    print("Calgary Transit API Configuration")
    print("=" * 50)
    print(
        f"App Token Configured: {'✅ Yes' if settings.calgary_app_token else '❌ No'}"
    )
    print(f"Debug Mode: {'✅ On' if settings.debug else '❌ Off'}")
    print("=" * 50)

    if not settings.calgary_app_token:
        print("\n⚠️  WARNING: CALGARY_APP_TOKEN not set in environment variables")
        print("The new LRT API endpoint will not work without an app token.")
        print("Create a .env file with CALGARY_APP_TOKEN=your_token_here")


# Print status when module is loaded
print_config_status()
