#!/usr/bin/env python3
"""Evaluate relative model responses on demo sequences; does not claim real-world detection accuracy."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from app.models.baseline import finalize_baseline, update_baseline
from app.services.inference_service import analyze
from app.schemas.proctoring import AnalyzeRequest, BaselineState, FeatureVector, ProctoringPolicy, TemporalState

def main() -> int:
    sequences = json.loads((Path(__file__).resolve().parents[1] / "tests" / "demo_sequences.json").read_text()); report = []
    for name, frames in sequences.items():
        baseline = BaselineState()
        for frame in frames[:6]: baseline = update_baseline(baseline, FeatureVector(**frame))
        baseline = finalize_baseline(baseline); state = TemporalState(); results = []
        for index, frame in enumerate(frames[6:]):
            response = analyze(AnalyzeRequest(attempt_id=f"demo-{name}", student_id="demo", timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=index * 2), features=FeatureVector(**frame), baseline=baseline, temporal_state=state, policy=ProctoringPolicy(minimum_event_seconds=2, face_absence_seconds=2)))
            state = response.temporal_state; results.append({"risk_score": response.risk_score, "events": [event.event_type for event in response.events]})
        report.append({"sequence": name, "max_risk_score": max((entry["risk_score"] for entry in results), default=0), "events": sorted({event for entry in results for event in entry["events"]})})
    print(json.dumps({"report": report, "limitation": "Demo sequences test expected relative model behavior only. They do not establish real-world cheating-detection accuracy, false-positive rate, precision, or recall."}, indent=2)); return 0

if __name__ == "__main__": raise SystemExit(main())
