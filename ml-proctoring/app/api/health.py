from fastapi import APIRouter
from ..core.config import get_settings
router = APIRouter(tags=["health"])

@router.get("/health")
def health() -> dict: return {"status": "ok", "service": "neuroclass-ml-proctoring"}

@router.get("/ready")
def ready() -> dict: return {"ready": bool(get_settings().service_api_key), "model_version": get_settings().model_version}
