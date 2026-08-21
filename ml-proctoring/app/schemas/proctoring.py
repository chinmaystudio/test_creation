from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class FeatureVector(BaseModel):
    """Compact numeric signals only; raw image or video fields are deliberately rejected."""
    model_config = ConfigDict(extra="forbid")
    face_present: bool | None = None
    face_count: int | None = Field(default=None, ge=0, le=10)
    face_bbox_area: float | None = Field(default=None, ge=0, le=1)
    face_center_x: float | None = Field(default=None, ge=0, le=1)
    face_center_y: float | None = Field(default=None, ge=0, le=1)
    head_pose_yaw: float | None = Field(default=None, ge=-180, le=180)
    head_pose_pitch: float | None = Field(default=None, ge=-180, le=180)
    head_pose_roll: float | None = Field(default=None, ge=-180, le=180)
    gaze_horizontal: float | None = Field(default=None, ge=-1, le=1)
    gaze_vertical: float | None = Field(default=None, ge=-1, le=1)
    landmark_stability: float | None = Field(default=None, ge=0, le=1)
    face_quality: float | None = Field(default=None, ge=0, le=1)
    frame_quality: float | None = Field(default=None, ge=0, le=1)
    movement_score: float | None = Field(default=None, ge=0, le=1)
    provider: str = Field(default="browser_native", max_length=80)


class BaselineStatistic(BaseModel):
    median: float
    mad: float = Field(ge=0)
    count: int = Field(ge=1)


class BaselineState(BaseModel):
    sample_count: int = Field(default=0, ge=0)
    calibration_samples: dict[str, list[float]] = Field(default_factory=dict)
    feature_stats: dict[str, BaselineStatistic] = Field(default_factory=dict)
    finalized: bool = False


class TemporalState(BaseModel):
    active_since: dict[str, float] = Field(default_factory=dict)
    emitted: dict[str, bool] = Field(default_factory=dict)
    last_emitted_at: dict[str, float] = Field(default_factory=dict)


class ProctoringPolicy(BaseModel):
    baseline_seconds: int = Field(default=20, ge=5, le=90)
    minimum_event_seconds: int = Field(default=4, ge=1, le=60)
    event_cooldown_seconds: int = Field(default=20, ge=3, le=300)
    face_absence_seconds: int = Field(default=5, ge=2, le=120)
    head_turn_degrees: float = Field(default=40, ge=15, le=120)
    minimum_confidence: float = Field(default=0.6, ge=0, le=1)
    risk_weights: dict[str, float] = Field(default_factory=lambda: {"face_missing": 35.0, "multiple_faces": 45.0, "unknown_face": 45.0, "head_away": 20.0, "gaze_deviation": 15.0, "camera_obstructed": 25.0, "behavior_anomaly": 30.0})


class BaselineStartRequest(BaseModel):
    attempt_id: str = Field(min_length=4, max_length=80)


class BaselineUpdateRequest(BaseModel):
    attempt_id: str = Field(min_length=4, max_length=80)
    features: FeatureVector
    baseline: BaselineState


class AnalyzeRequest(BaseModel):
    attempt_id: str = Field(min_length=4, max_length=80)
    student_id: str = Field(min_length=1, max_length=80)
    timestamp: datetime
    features: FeatureVector
    face_verified: bool | None = None
    baseline: BaselineState
    temporal_state: TemporalState = Field(default_factory=TemporalState)
    policy: ProctoringPolicy = Field(default_factory=ProctoringPolicy)


class ProctoringEvent(BaseModel):
    event_type: Literal["face_missing", "multiple_faces", "unknown_face", "head_away", "gaze_deviation", "camera_obstructed", "behavior_anomaly"]
    severity: Literal["low", "medium", "high"]
    confidence: float = Field(ge=0, le=1)
    duration_seconds: float = Field(ge=0)
    evidence: dict[str, Any] = Field(default_factory=dict)


class AnalyzeResponse(BaseModel):
    anomaly_score: float = Field(ge=0, le=100)
    risk_score: float = Field(ge=0, le=100)
    risk_level: Literal["low", "medium", "high"]
    confidence: float = Field(ge=0, le=1)
    events: list[ProctoringEvent] = Field(default_factory=list)
    baseline: BaselineState
    temporal_state: TemporalState
    model_version: str
    baseline_ready: bool
