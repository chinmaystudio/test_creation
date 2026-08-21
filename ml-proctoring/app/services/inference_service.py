from ..core.config import get_settings
from ..models.anomaly_detector import RobustBaselineDetector
from ..models.baseline import finalize_baseline, update_baseline
from ..models.risk_engine import calculate_risk
from ..schemas.proctoring import AnalyzeRequest, AnalyzeResponse, BaselineState, FeatureVector

detector = RobustBaselineDetector()

def start_baseline() -> BaselineState: return BaselineState()
def update_calibration(baseline: BaselineState, features: FeatureVector) -> BaselineState: return update_baseline(baseline, features)
def finalize_calibration(baseline: BaselineState) -> BaselineState: return finalize_baseline(baseline)

def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    anomaly_score, anomaly_confidence = detector.score(request.baseline, request.features)
    events, temporal_state, risk_score, risk_level = calculate_risk(request.features, request.face_verified, anomaly_score, anomaly_confidence, request.temporal_state, request.policy, request.timestamp)
    return AnalyzeResponse(anomaly_score=round(anomaly_score, 2), risk_score=round(risk_score, 2), risk_level=risk_level, confidence=round(anomaly_confidence, 2), events=events, baseline=request.baseline, temporal_state=temporal_state, model_version=get_settings().model_version, baseline_ready=request.baseline.finalized)
