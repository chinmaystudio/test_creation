from collections import defaultdict, deque
from time import monotonic
from fastapi import HTTPException, status
from .config import get_settings

_windows: dict[str, deque[float]] = defaultdict(deque)


def enforce_attempt_rate_limit(attempt_id: str) -> None:
    now = monotonic(); window = _windows[attempt_id]; cutoff = now - 60
    while window and window[0] < cutoff: window.popleft()
    if len(window) >= get_settings().rate_limit_per_minute:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Feature analysis rate limit exceeded for this attempt.")
    window.append(now)
