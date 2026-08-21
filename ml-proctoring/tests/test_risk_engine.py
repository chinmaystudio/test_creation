from datetime import datetime, timezone
from app.models.risk_engine import calculate_risk
from app.schemas.proctoring import FeatureVector, ProctoringPolicy, TemporalState

def test_multiple_faces_requires_persistence_before_event():
    policy = ProctoringPolicy(minimum_event_seconds=3, event_cooldown_seconds=10); now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    events, state, _, _ = calculate_risk(FeatureVector(face_count=2), None, 0, 0, TemporalState(), policy, now)
    assert events == []
    events, _, score, level = calculate_risk(FeatureVector(face_count=2), None, 0, 0, state, policy, datetime(2026, 1, 1, 0, 0, 4, tzinfo=timezone.utc))
    assert events[0].event_type == "multiple_faces" and score > 30 and level in {"medium", "high"}

def test_transient_face_absence_does_not_emit_event():
    policy = ProctoringPolicy(face_absence_seconds=5); now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    events, state, _, _ = calculate_risk(FeatureVector(face_present=False, face_count=0), None, 0, 0, TemporalState(), policy, now)
    events, _, _, _ = calculate_risk(FeatureVector(face_present=True, face_count=1), None, 0, 0, state, policy, datetime(2026, 1, 1, 0, 0, 2, tzinfo=timezone.utc))
    assert events == []
