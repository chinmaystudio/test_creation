from app.models.baseline import finalize_baseline, update_baseline
from app.models.anomaly_detector import RobustBaselineDetector
from app.schemas.proctoring import BaselineState, FeatureVector

def test_robust_baseline_scores_normal_samples_lower_than_large_deviation():
    baseline = BaselineState()
    for offset in (0.0, 0.01, -0.01, 0.02, -0.02, 0.0):
        baseline = update_baseline(baseline, FeatureVector(face_bbox_area=0.25 + offset, head_pose_yaw=offset * 10, frame_quality=0.9))
    baseline = finalize_baseline(baseline)
    detector = RobustBaselineDetector()
    normal_score, _ = detector.score(baseline, FeatureVector(face_bbox_area=0.25, head_pose_yaw=0, frame_quality=0.9))
    anomalous_score, _ = detector.score(baseline, FeatureVector(face_bbox_area=0.7, head_pose_yaw=80, frame_quality=0.2))
    assert baseline.finalized and normal_score < anomalous_score
