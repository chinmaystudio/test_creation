from datetime import datetime
from ..schemas.proctoring import FeatureVector, ProctoringEvent, ProctoringPolicy, TemporalState


def _signal_event(event_type: str, active: bool, now: float, confidence: float, evidence: dict, state: TemporalState, policy: ProctoringPolicy, required_seconds: float | None = None) -> tuple[ProctoringEvent | None, TemporalState]:
    active_since, emitted, last_emitted_at = dict(state.active_since), dict(state.emitted), dict(state.last_emitted_at)
    if not active:
        active_since.pop(event_type, None); emitted.pop(event_type, None)
        return None, TemporalState(active_since=active_since, emitted=emitted, last_emitted_at=last_emitted_at)
    started = active_since.setdefault(event_type, now); duration = max(0.0, now - started); threshold = required_seconds if required_seconds is not None else policy.minimum_event_seconds
    cooled_down = now - last_emitted_at.get(event_type, -10_000) >= policy.event_cooldown_seconds
    next_state = TemporalState(active_since=active_since, emitted=emitted, last_emitted_at=last_emitted_at)
    if duration < threshold or emitted.get(event_type, False) or not cooled_down or confidence < policy.minimum_confidence:
        return None, next_state
    emitted[event_type], last_emitted_at[event_type] = True, now
    severity = "high" if event_type in {"multiple_faces", "unknown_face"} else "medium" if confidence >= 0.8 else "low"
    return ProctoringEvent(event_type=event_type, severity=severity, confidence=confidence, duration_seconds=duration, evidence={**evidence, "duration_seconds": round(duration, 2)}), TemporalState(active_since=active_since, emitted=emitted, last_emitted_at=last_emitted_at)


def calculate_risk(features: FeatureVector, face_verified: bool | None, anomaly_score: float, anomaly_confidence: float, state: TemporalState, policy: ProctoringPolicy, timestamp: datetime) -> tuple[list[ProctoringEvent], TemporalState, float, str]:
    now, values = timestamp.timestamp(), features.model_dump()
    signals = [
        ("face_missing", values.get("face_present") is False or values.get("face_count") == 0, 0.95, {"face_count": values.get("face_count")}, policy.face_absence_seconds),
        ("multiple_faces", bool((values.get("face_count") or 0) > 1), 0.95, {"face_count": values.get("face_count")}, policy.minimum_event_seconds),
        ("unknown_face", face_verified is False, 0.9, {"face_verified": False}, policy.minimum_event_seconds),
        ("head_away", values.get("head_pose_yaw") is not None and abs(float(values["head_pose_yaw"])) >= policy.head_turn_degrees, 0.7, {"head_pose_yaw": values.get("head_pose_yaw")}, policy.minimum_event_seconds),
        ("gaze_deviation", values.get("gaze_horizontal") is not None and abs(float(values["gaze_horizontal"])) >= 0.7, 0.65, {"gaze_horizontal": values.get("gaze_horizontal")}, policy.minimum_event_seconds),
        ("camera_obstructed", values.get("frame_quality") is not None and float(values["frame_quality"]) < 0.2, 0.75, {"frame_quality": values.get("frame_quality")}, policy.minimum_event_seconds),
        ("behavior_anomaly", anomaly_score >= 60.0, anomaly_confidence, {"anomaly_score": round(anomaly_score, 2)}, policy.minimum_event_seconds),
    ]
    events: list[ProctoringEvent] = []; current_state = state
    for event_type, active, confidence, evidence, duration in signals:
        event, current_state = _signal_event(event_type, active, now, confidence, evidence, current_state, policy, duration)
        if event: events.append(event)
    direct_score = sum(policy.risk_weights.get(event.event_type, 0.0) * event.confidence for event in events)
    risk_score = min(100.0, anomaly_score * 0.4 + direct_score)
    return events, current_state, risk_score, "high" if risk_score > 60 else "medium" if risk_score > 30 else "low"
