import os
from dotenv import load_dotenv

load_dotenv()

CALGARY_APP_TOKEN = os.getenv("CALGARY_APP_TOKEN")

if not CALGARY_APP_TOKEN:
    raise RuntimeError("CALGARY_APP_TOKEN is not set")
