from __future__ import annotations
from statistics import median
from math import isfinite
from ..schemas.proctoring import BaselineState, BaselineStatistic, FeatureVector

CONTINUOUS_FEATURES = ("face_bbox_area", "face_center_x", "face_center_y", "head_pose_yaw", "head_pose_pitch", "head_pose_roll", "gaze_horizontal", "gaze_vertical", "landmark_stability", "face_quality", "frame_quality", "movement_score")


def _numeric_values(features: FeatureVector) -> dict[str, float]:
    values = features.model_dump()
    return {name: float(values[name]) for name in CONTINUOUS_FEATURES if values.get(name) is not None and isfinite(float(values[name]))}


def update_baseline(state: BaselineState, features: FeatureVector, max_samples: int = 90) -> BaselineState:
    if state.finalized:
        return state
    samples = {name: list(values[-max_samples:]) for name, values in state.calibration_samples.items()}
    for name, value in _numeric_values(features).items():
        samples.setdefault(name, []).append(value)
        samples[name] = samples[name][-max_samples:]
    return BaselineState(sample_count=state.sample_count + 1, calibration_samples=samples, feature_stats=state.feature_stats, finalized=False)


def finalize_baseline(state: BaselineState) -> BaselineState:
    stats: dict[str, BaselineStatistic] = {}
    for name, values in state.calibration_samples.items():
        if len(values) < 4:
            continue
        center = median(values)
        stats[name] = BaselineStatistic(median=center, mad=max(median([abs(value - center) for value in values]), 0.01), count=len(values))
    return BaselineState(sample_count=state.sample_count, calibration_samples={}, feature_stats=stats, finalized=bool(stats))
