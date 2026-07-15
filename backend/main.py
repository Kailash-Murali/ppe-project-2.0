# main.py
# FastAPI app factory, lifespan context manager, middleware.
#
# Key changes from v1:
#   - @app.on_event("startup/shutdown") replaced with @asynccontextmanager lifespan
#     (FastAPI 0.93+ recommended pattern; avoids the deprecation warning).
#   - asyncio.get_event_loop() replaced with asyncio.get_running_loop() (required
#     in Python 3.10+ where get_event_loop() emits a DeprecationWarning).
#   - Raw threading.Thread replaced with concurrent.futures.ThreadPoolExecutor.
#     The executor runs the inference loop in a dedicated worker thread, providing
#     clean future-based lifecycle management and a standard shutdown() API.
#   - CORS allow_origins reads from settings.cors_allowed_origins instead of
#     hardcoded ["*"] — configurable per-environment via .env.
#   - Structured JSON logging is initialised via configure_logging() before the
#     app is constructed so all startup messages are also JSON-formatted.
#   - Prometheus metrics are mounted at /metrics via prometheus-fastapi-instrumentator.

import asyncio
import logging
import queue
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator  # type: ignore[import-untyped]

from config import settings
from inference import detect_device, inference_loop
from logging_config import configure_logging
from routes.detection import router
from state import AppState

# ── Structured logging must be configured before any other code logs ──────────
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)


# ── Lifespan context manager (replaces @app.on_event) ─────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan handler — replaces deprecated @app.on_event("startup/shutdown").

    Startup:
      1. Validate model path (fail fast).
      2. Select inference device.
      3. Create AppState and capture the running event loop.
      4. Submit inference_loop to a ThreadPoolExecutor.

    Shutdown:
      1. Signal inference loop to exit via shutdown_event.
      2. Push None sentinel to unblock queue.get() immediately.
      3. Shut down executor (waits up to 5 s for the thread to finish).
    """
    # ── Startup ──────────────────────────────────────────────────────────────
    model_path = Path(settings.model_path)
    if not model_path.exists():
        raise RuntimeError(
            f"[startup] Model path not found: '{model_path.resolve()}'. "
            "Set MODEL_PATH in .env or environment."
        )

    device = detect_device()
    state = AppState(queue_maxsize=settings.frame_queue_size)

    # asyncio.get_running_loop() is the correct API inside an async context
    # (get_event_loop() is deprecated in Python 3.10+).
    state.ws_loop = asyncio.get_running_loop()

    # ThreadPoolExecutor with max_workers=1 preserves the thread-affinity
    # requirement for OpenVINO compiled inference requests.
    executor = ThreadPoolExecutor(max_workers=settings.executor_workers)
    state.executor = executor
    executor.submit(
        inference_loop,
        state,
        str(model_path),
        device,
        settings.inference_timeout,
    )

    app.state.detector = state
    logger.info("Server ready", extra={"device": device, "model_path": str(model_path)})

    yield  # ← application serves requests between here and the next block

    # ── Shutdown ──────────────────────────────────────────────────────────────
    state.shutdown_event.set()

    # Sentinel unblocks queue.get() immediately without waiting for timeout.
    try:
        state.frame_queue.put_nowait(None)
    except queue.Full:
        pass

    # wait=True: blocks until the worker thread finishes (up to OS scheduler).
    # cancel_futures=False: the already-running future (inference loop) is allowed
    # to complete its current frame before exiting.
    executor.shutdown(wait=True, cancel_futures=False)
    logger.info("Executor shut down cleanly")


# ── App factory ────────────────────────────────────────────────────────────────
app = FastAPI(title="PPE Inference Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # Read from settings; defaults to localhost for dev deployments.
    # Set CORS_ALLOWED_ORIGINS=https://your-domain.com in .env for production.
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(router)

# ── Prometheus metrics (/metrics) ──────────────────────────────────────────────
# Automatically instruments all HTTP endpoints with request count, latency
# histograms, and response size metrics.
#
# Security note: /metrics is unauthenticated and served on the same port as the
# API. This is acceptable for internal-network deployments where only trusted
# hosts (e.g., a Prometheus scraper on the same VLAN) can reach the server.
# If the backend is ever exposed to an untrusted network, restrict /metrics access
# via a reverse-proxy allow-list (e.g., nginx: allow 10.0.0.0/8; deny all;).
Instrumentator().instrument(app).expose(app)
