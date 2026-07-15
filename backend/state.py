# state.py
# Pure data container. Zero class methods. Zero logic.
# Holds all shared state between the FastAPI event loop and the executor thread.
#
# Threading model (post-refactor):
#   - The inference loop runs inside a concurrent.futures.ThreadPoolExecutor
#     (max_workers=1 by default for OpenVINO thread-affinity safety).
#   - shutdown_event signals the inference loop to exit cleanly before the
#     executor is shut down during the FastAPI lifespan teardown.
#   - ws_loop is captured at startup and used by the inference thread to
#     schedule WebSocket broadcasts back onto the asyncio event loop via
#     asyncio.run_coroutine_threadsafe().
#
# Backpressure:
#   - dropped_frames counts the number of frames discarded due to queue overflow.
#     This value is exposed via GET /health and as a Prometheus gauge.

import queue
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional, List, Dict, Set
import asyncio
from fastapi import WebSocket


class AppState:
    def __init__(self, queue_maxsize: int = 10):
        # ── Model output ──────────────────────────────────────────────────────
        self.model: Any = None
        self.latest_frame: Optional[bytes] = None      # unused by inference loop
        self.latest_annot: Optional[bytes] = None      # MJPEG annotated frame bytes
        self.detections: List[Dict] = []

        # ── Active class filter ───────────────────────────────────────────────
        # Updated via POST /active-classes. GIL-safe: routes only reassign (never mutate).
        self.active_classes: Set[str] = {
            "helmet",  "no helmet",
            "gloves",  "no gloves",
            "glasses", "no glasses",
            "boots",   "no boots",
        }

        # ── Inference queue ───────────────────────────────────────────────────
        # Bounded queue — frames are dropped (drop-oldest) when full.
        self.frame_queue: queue.Queue = queue.Queue(maxsize=queue_maxsize)

        # ── Backpressure counter ──────────────────────────────────────────────
        # Incremented each time a frame is dropped due to queue overflow.
        # Exposed via /health and Prometheus gauge 'ppe_dropped_frames_total'.
        self.dropped_frames: int = 0

        # ── Executor / shutdown ───────────────────────────────────────────────
        # The executor runs the inference loop in a dedicated thread.
        # shutdown_event is set by the lifespan teardown to signal the loop to exit.
        self.executor: Optional[ThreadPoolExecutor] = None
        self.shutdown_event: threading.Event = threading.Event()

        # ── WebSocket broadcast ───────────────────────────────────────────────
        self.ws_clients: Set[WebSocket] = set()
        self.ws_loop: Optional[asyncio.AbstractEventLoop] = None

        # ── Annotation lock ───────────────────────────────────────────────────
        # latest_annot is written by the inference thread, read by HTTP handlers.
        self.annot_lock: threading.Lock = threading.Lock()
