# Deploying NeuroClass ML Proctoring to Render

## Deployment boundary

The repository contains two independently deployable components. The existing TypeScript portal remains the assessment application. The `ml-proctoring` directory is a separate FastAPI service that accepts compact feature vectors from the portal’s server only. The browser never receives the ML service key, and the service does not receive assessment answers or raw webcam video.

> The ML service produces review signals and technical evidence. It does not determine that a student cheated and must not be used as an automated disciplinary decision.

## Render deployment

The repository-root `render.yaml` describes a Docker-backed web service with `ml-proctoring` as its root. Render currently lists the Free web-service instance at **512 MB RAM and 0.1 CPU**, so the service uses one CPU worker, no GPU framework, bounded request payloads, and low-frequency feature analysis rather than streamed video. [1]

| Render setting | Value |
|---|---|
| Blueprint file | `render.yaml` at the repository root |
| Service root | `ml-proctoring` |
| Runtime | Docker |
| Health check | `/health` |
| Start command | Supplied by the service Dockerfile: Uvicorn on `$PORT` |
| Required secret | `ML_SERVICE_API_KEY` — a long random value |
| Optional values | `ML_MODEL_VERSION`, `ML_MAX_REQUEST_BYTES`, `ML_RATE_LIMIT_PER_MINUTE` |

Create a new Render Blueprint from the `test_creation` repository and provide a long, random `ML_SERVICE_API_KEY` value when Render requests the secret. Do not place this value in source control, client code, screenshots, or support tickets. Render documents FastAPI deployments using a web service that binds Uvicorn to `0.0.0.0` on Render’s supplied port; the Docker configuration follows the same port contract. [2]

## Connect the existing portal after Render reports a healthy URL

The portal intentionally remains in an **unconfigured-service state** until these two server-only values are entered. No code change is required after deployment.

| Portal secret | Value to enter |
|---|---|
| `ML_PROCTORING_URL` | Render’s HTTPS service URL, for example `https://neuroclass-ml-proctoring.onrender.com` |
| `ML_PROCTORING_API_KEY` | The exact same value used for Render’s `ML_SERVICE_API_KEY` |

After setting the values, use a teacher test with **AI feature-vector proctoring** enabled. The pre-exam check will initialize a compact baseline. A test configured with the **Block** failure policy will refuse to begin when `/ready` is unavailable; the other teacher-selected policies remain visible and explicit.

## Privacy and capability boundary

The browser sampler requests a camera only when the workflow enables it, derives compact measurements at 1–3 updates per second, and forwards supported measurements such as face count, normalized bounding box, frame quality, and movement score. Raw frames are not uploaded or persisted by default. The deployment does not include an identity matcher, gaze tracker, head-pose model, or raw-video evidence store. Unsupported signals are reported as unavailable rather than inferred.

Teacher results display timestamps, persistence duration, confidence, risk score, model version, and a human review action. Dismissing or marking an event as a concern records a teacher review state; it does not change the student’s academic score automatically.

## Verification commands

Run these commands from `ml-proctoring` before and after deployment. The demo evaluation intentionally reports relative behavior on synthetic sequences only; it does not claim real-world cheating-detection accuracy.

```bash
ML_SERVICE_API_KEY=local-development-key PYTHONPATH=. pytest -q
ML_SERVICE_API_KEY=local-development-key PYTHONPATH=. python3 scripts/evaluate.py
ML_SERVICE_API_KEY=local-development-key PYTHONPATH=. python3 scripts/benchmark.py
ML_SERVICE_API_KEY=local-development-key PYTHONPATH=. python3 scripts/check_model_size.py --threshold-mb 512
```

## Workflow verification checklist

Before releasing an AI-proctored assessment, complete these checks with separate teacher and student accounts. They verify control flow and policy behavior; they do not establish real-world detection accuracy.

| Scenario | Expected result |
|---|---|
| Teacher enables AI proctoring with **Block** and visits the student pre-exam page while the ML service is unconfigured | The timed attempt cannot begin. The student sees an explicit unavailable-service/baseline state rather than a false verification claim. |
| Teacher enables **Warn**, **Browser signals only**, or **Manual review** with the ML service unconfigured | The student can start through the documented fallback path; the server persists the fallback status and browser signals remain separately logged when enabled. |
| Teacher enables **Block** with a configured service | The student completes the configured baseline before `attempts.begin` starts the server-authoritative timer. Direct navigation to `/student/tests/:testId/attempt` redirects to the pre-exam check instead of silently bypassing calibration. |
| The service receives persistent multiple-face or face-absence demo vectors | It emits one temporally confirmed metadata event after the selected duration/cooldown conditions—not one event for a transient frame. |
| Teacher opens the assessment results page | The timeline shows technical event metadata and lets the teacher dismiss or mark a concern. Neither action changes a score or records an automatic misconduct conclusion. |

## References

[1] [Render Pricing — Web-service compute plans](https://render.com/pricing)

[2] [Render Docs — Deploy a FastAPI App](https://render.com/docs/deploy-fastapi)
