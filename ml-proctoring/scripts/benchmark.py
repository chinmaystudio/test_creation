#!/usr/bin/env python3
"""Measure local in-process feature-scoring latency and Python allocation; run after deployment separately for service metrics."""
import json, time, tracemalloc
from datetime import datetime, timezone
from app.models.baseline import finalize_baseline, update_baseline
from app.services.inference_service import analyze
from app.schemas.proctoring import AnalyzeRequest, BaselineState, FeatureVector, ProctoringPolicy

def main() -> int:
    baseline = BaselineState(); feature = FeatureVector(face_present=True, face_count=1, face_bbox_area=0.24, head_pose_yaw=2, frame_quality=0.9, movement_score=0.1)
    for _ in range(20): baseline = update_baseline(baseline, feature)
    baseline = finalize_baseline(baseline); request = AnalyzeRequest(attempt_id="benchmark-attempt", student_id="benchmark", timestamp=datetime.now(timezone.utc), features=feature, baseline=baseline, policy=ProctoringPolicy())
    tracemalloc.start(); started = time.perf_counter()
    for _ in range(500): analyze(request)
    elapsed = time.perf_counter() - started; _, peak = tracemalloc.get_traced_memory()
    print(json.dumps({"in_process_samples": 500, "mean_inference_ms": round(elapsed * 1000 / 500, 3), "peak_python_allocated_mb": round(peak / 1_000_000, 3), "note": "This is a local in-process benchmark, not a production concurrency or cold-start claim."}, indent=2)); return 0

if __name__ == "__main__": raise SystemExit(main())
