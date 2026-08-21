# NeuroClass ML Proctoring Service

This independent FastAPI service analyzes compact, privacy-conscious proctoring features. It uses a per-attempt robust unsupervised baseline (median/MAD distance) and deterministic, temporally smoothed risk rules. It is **not** a cheating detector or automated disciplinary system.

## Local verification

```bash
python -m pip install -r requirements.txt
ML_SERVICE_API_KEY=local-development-key pytest -q
ML_SERVICE_API_KEY=local-development-key python scripts/evaluate.py
ML_SERVICE_API_KEY=local-development-key python scripts/benchmark.py
ML_SERVICE_API_KEY=local-development-key python scripts/check_model_size.py --threshold-mb 512
ML_SERVICE_API_KEY=local-development-key uvicorn app.main:app --host 0.0.0.0 --port 10000
```

The Node portal sends feature vectors only; it does not send full webcam frames or answers to this service. Every `/v1/*` endpoint requires `X-Proctoring-Service-Key`.

## Deployment and evaluation limits

Deploy from the `ml-proctoring` root with `render.yaml`. Configure a long random `ML_SERVICE_API_KEY` in Render and use the same value as `ML_PROCTORING_API_KEY` in the Node app. The request limit defaults to 65,536 bytes, which rejects image and video payloads.

Render’s Free web-service plan currently provides 512 MB RAM and 0.1 CPU. This service uses a single CPU worker and excludes GPU frameworks, TensorFlow, PyTorch, OpenCV, and MediaPipe. The footprint script measures relevant packages plus model artifacts—not full image size.

`scripts/evaluate.py` tests expected relative behavior on synthetic feature sequences. It does **not** establish real-world cheating-detection accuracy, precision, recall, ROC-AUC, or false-positive rate.
