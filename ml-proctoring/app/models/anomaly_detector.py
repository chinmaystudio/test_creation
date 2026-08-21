from statistics import median
from ..schemas.proctoring import BaselineState, FeatureVector
from .baseline import _numeric_values


class RobustBaselineDetector:
    """Per-attempt unsupervised detector using robust median/MAD distance from normal calibration data."""
    version = "robust-baseline-v1.0.0"

    def score(self, baseline: BaselineState, features: FeatureVector) -> tuple[float, float]:
        if not baseline.finalized or not baseline.feature_stats:
            return 0.0, 0.0
        distances: list[float] = []
        for name, value in _numeric_values(features).items():
            stat = baseline.feature_stats.get(name)
            if stat:
                distances.append(abs(value - stat.median) / max(stat.mad * 3.0, 0.03))
        if not distances:
            return 0.0, 0.0
        return min(1.0, median(distances) / 3.0) * 100.0, min(1.0, len(distances) / 6.0)
