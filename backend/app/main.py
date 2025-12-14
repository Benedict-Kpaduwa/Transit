from fastapi import FastAPI
from app.routers import transit

app = FastAPI(
    title="Calgary Transit Backend",
    description="FastAPI backend for Calgary Open Data Transit API",
    version="1.0.0",
)

app.include_router(transit.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
