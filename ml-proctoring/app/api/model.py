from fastapi import APIRouter, Depends
from ..core.config import get_settings
from ..core.security import require_service_key
router = APIRouter(prefix="/v1/model", tags=["model"], dependencies=[Depends(require_service_key)])

@router.get("/info")
def model_info() -> dict: return {"model_version": get_settings().model_version, "method": "per_attempt_robust_unsupervised_baseline", "raw_video_storage": False}
