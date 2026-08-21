#!/usr/bin/env python3
"""Fail when model artifacts plus relevant installed ML packages exceed the deployment budget."""
import argparse
import importlib
from pathlib import Path

def directory_size(path: Path) -> int:
    return sum(file.stat().st_size for file in path.rglob("*") if file.is_file())

def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("--threshold-mb", type=float, default=512.0); args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    artifacts = directory_size(root / "model_artifacts") if (root / "model_artifacts").exists() else 0
    package_bytes = 0
    for package in ("fastapi", "pydantic", "numpy", "sklearn", "joblib", "uvicorn"):
        package_bytes += directory_size(Path(importlib.import_module(package).__file__).resolve().parent)
    total = artifacts + package_bytes
    print(f"model_artifacts_mb={artifacts / 1_000_000:.2f}\nrelevant_dependencies_mb={package_bytes / 1_000_000:.2f}\nrelevant_total_mb={total / 1_000_000:.2f}")
    if total > args.threshold_mb * 1_000_000:
        print("FAIL: relevant proctoring artifact footprint exceeds threshold"); return 1
    print("PASS: relevant proctoring artifact footprint is within threshold"); return 0

if __name__ == "__main__": raise SystemExit(main())
