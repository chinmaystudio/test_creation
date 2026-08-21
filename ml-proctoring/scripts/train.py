#!/usr/bin/env python3
"""Optional reproducible global normal-session Isolation Forest training; never runs in request handling."""
import argparse, json
from pathlib import Path
import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

FEATURES = ["face_bbox_area", "head_pose_yaw", "head_pose_pitch", "gaze_horizontal", "gaze_vertical", "frame_quality", "face_quality", "movement_score"]

def main() -> int:
    parser = argparse.ArgumentParser(description="Train from consented normal-session JSONL feature rows.")
    parser.add_argument("--input", required=True); parser.add_argument("--output", default="model_artifacts/isolation_forest.joblib"); parser.add_argument("--contamination", type=float, default=0.03); args = parser.parse_args()
    rows = [json.loads(line) for line in Path(args.input).read_text().splitlines() if line.strip()]
    matrix = np.array([[float(row.get(name, 0.0)) for name in FEATURES] for row in rows], dtype=np.float32)
    if len(matrix) < 20: raise SystemExit("At least 20 consented normal-session feature rows are required; no model was written.")
    model = IsolationForest(contamination=args.contamination, random_state=42, n_estimators=100, n_jobs=1); model.fit(matrix)
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": FEATURES, "source_rows": len(rows), "method": "IsolationForest"}, output, compress=3)
    print(json.dumps({"artifact": str(output), "source_rows": len(rows), "note": "Training used normal-session data only; no cheating-detection accuracy is claimed."})); return 0

if __name__ == "__main__": raise SystemExit(main())
