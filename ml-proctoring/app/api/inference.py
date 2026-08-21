from fastapi import APIRouter, Depends
from ..core.security import require_service_key
from ..core.rate_limit import enforce_attempt_rate_limit
from ..schemas.proctoring import AnalyzeRequest, AnalyzeResponse, BaselineStartRequest, BaselineState, BaselineUpdateRequest
from ..services.inference_service import analyze, finalize_calibration, start_baseline, update_calibration
router = APIRouter(prefix="/v1/proctoring", tags=["proctoring"], dependencies=[Depends(require_service_key)])

@router.post("/baseline/start", response_model=BaselineState)
def baseline_start(_: BaselineStartRequest) -> BaselineState: return start_baseline()

@router.post("/baseline/update", response_model=BaselineState)
def baseline_update(request: BaselineUpdateRequest) -> BaselineState:
    enforce_attempt_rate_limit(request.attempt_id)
    return update_calibration(request.baseline, request.features)

@router.post("/baseline/finalize", response_model=BaselineState)
def baseline_finalize(request: BaselineUpdateRequest) -> BaselineState: return finalize_calibration(request.baseline)

@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_features(request: AnalyzeRequest) -> AnalyzeResponse:
    enforce_attempt_rate_limit(request.attempt_id)
    return analyze(request)
