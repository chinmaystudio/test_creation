import hmac
from fastapi import Header, HTTPException, status
from .config import get_settings


def require_service_key(x_proctoring_service_key: str | None = Header(default=None)) -> None:
    expected = get_settings().service_api_key
    if not expected:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="ML service authentication is not configured.")
    if not x_proctoring_service_key or not hmac.compare_digest(x_proctoring_service_key, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service credentials.")
