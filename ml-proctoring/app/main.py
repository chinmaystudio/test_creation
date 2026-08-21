from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from .api.health import router as health_router
from .api.inference import router as inference_router
from .api.model import router as model_router
from .core.config import get_settings

app = FastAPI(title="NeuroClass ML Proctoring", version="1.0.0", docs_url=None, redoc_url=None)
app.include_router(health_router); app.include_router(inference_router); app.include_router(model_router)

@app.middleware("http")
async def enforce_payload_limit(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > get_settings().max_request_bytes:
        return JSONResponse(status_code=413, content={"detail": "Request exceeds the compact feature payload limit."})
    return await call_next(request)
