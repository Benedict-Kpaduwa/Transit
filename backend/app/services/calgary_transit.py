import httpx
from app.config import CALGARY_APP_TOKEN

BASE_URL = "https://data.calgary.ca/api/v3/views/hpnd-riq4/query.json"


async def fetch_transit_data(page: int = 1, size: int = 100):
    params = {
        "pageNumber": page,
        "pageSize": size,
        "app_token": CALGARY_APP_TOKEN,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(BASE_URL, params=params)
        response.raise_for_status()
        return response.json()


def normalize_records(api_response):
    """
    Normalize Socrata v3 responses safely.
    Handles both list and dict top-level responses.
    """

    # If response is a list, extract the first object
    if isinstance(api_response, list):
        if not api_response:
            return []
        api_response = api_response[0]

    if not isinstance(api_response, dict):
        return []

    meta = api_response.get("meta", [])
    data = api_response.get("data", [])

    if not meta or "view" not in meta[0]:
        return []

    columns = [col["name"] for col in meta[0]["view"]["columns"]]

    return [
        dict(zip(columns, row))
        for row in data
    ]
