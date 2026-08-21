# NeuroClass AI Proctoring Contract

## Purpose and Decision Boundary

The proctoring service is an **assistive risk-detection system**. It records compact technical evidence and produces configurable risk signals for teacher review. It does not determine that a student cheated, does not automatically penalize a student, and does not stream or retain webcam video by default.

## Runtime Architecture

The browser samples a low-frequency feature vector from the enrolled device. The Node application validates attempt ownership, applies the teacher-selected policy, authenticates to the standalone FastAPI service, and persists only the returned event metadata and compact baseline state. The Python service never receives an answer payload and never needs continuous full-resolution video.

| Boundary | Responsibility | Data retained by default |
|---|---|---|
| Browser | Camera permission, native face-count capability, frame-quality/motion features, browser signals | No video recording |
| Node application | Authorization, policy enforcement, service authentication, database writes, teacher review | Event metadata and baseline JSON |
| FastAPI service | Robust unsupervised baseline scoring, temporal smoothing, deterministic event/risk calculation | Request-local feature vectors only |
| Teacher | Reviews, dismisses, or marks events as a concern | Human decision recorded separately |

## Detection Policy

The implemented baseline scorer learns compact robust statistics from the initial calibration period and compares later feature windows against that personal baseline. It uses median and median-absolute-deviation normalization rather than a supervised cheating classifier. Direct technical signals such as persistent zero/multiple faces are independently confirmed over time before a review event is emitted.

Events use minimum-duration confirmation, cooldowns, consecutive sampling, and temporal state stored with the attempt. The server sends policy values to the ML service; the browser never submits a final risk score. Missing, unavailable, or unsupported signals are reported as unavailable rather than inferred.

## Feature Contract

The request contains values that are actually available at sampling time. Supported browser baseline features include `facePresent`, `faceCount`, normalized face bounding-box measurements where native detection is available, `frameQuality`, `faceQuality`, and `movementScore`. Optional head-pose, gaze, and verification fields are accepted only for a separately configured feature provider; they are never fabricated from the baseline browser path.

## Failure, Privacy, and Review

When AI proctoring is enabled, each test selects one of `block`, `warn`, `fallback_browser_signals`, or `manual_review` for service outages. `block` prevents a new protected attempt from starting if the service is not ready. The other policies remain explicit in the student and teacher experience.

> Face identity comparison is intentionally separate from behavioral anomaly scoring. The baseline deployment provides no identity matcher unless an organization configures a compatible face-verification provider; no unknown-face conclusion is emitted when that provider is unavailable.

## Model Evaluation

The service includes reproducible training, evaluation, benchmark, and model-footprint scripts. Evaluation reports score behavior on normal and **synthetic** anomaly sequences. It does not claim real-world cheating-detection accuracy, precision, recall, or false-positive rates without a representative, consented, labeled evaluation dataset.
