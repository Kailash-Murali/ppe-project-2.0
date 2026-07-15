# routes/detection.py
# HTTP and WebSocket handlers only. State access via request.app.state.detector.
# No model logic here.
#
# Backpressure: frame enqueuing is delegated to inference.enqueue_frame() which
# implements the drop-oldest policy and increments state.dropped_frames on overflow.
# The /frame HTTP endpoint returns HTTP 429 when a frame is dropped, so the caller
# can back off. The WebSocket path logs the drop but does not disconnect.

import asyncio
import base64
import json
import logging

import cv2
import numpy as np
from pydantic import BaseModel
from fastapi import APIRouter, File, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse

from inference import ALLOWED_CLASSES, IMGSZ, IOU, enqueue_frame

router = APIRouter()
logger = logging.getLogger(__name__)


# ── /health ───────────────────────────────────────────────────────────────────
@router.get("/health")
def health(request: Request):
    """
    Server health check. Returns configuration snapshot and runtime counters.

    Fields:
      - status:          Always "ok" if the server is up.
      - imgsz/iou:       Inference hyperparameters.
      - allowed_classes: Classes the model will output.
      - dropped_frames:  Cumulative count of frames dropped due to queue overflow
                         (backpressure indicator). Reset to 0 on server restart.
      - ws_client_count: Number of currently connected WebSocket clients.
      - executor_alive:  True if the inference executor has a live future.
    """
    state = request.app.state.detector
    executor_alive = (
        state.executor is not None and
        not state.shutdown_event.is_set()
    )
    return {
        "status":          "ok",
        "imgsz":           IMGSZ,
        "iou":             IOU,
        "allowed_classes": sorted(ALLOWED_CLASSES),
        "dropped_frames":  state.dropped_frames,
        "ws_client_count": len(state.ws_clients),
        "executor_alive":  executor_alive,
    }


# ── /frame — HTTP frame upload with backpressure ──────────────────────────────
@router.post("/frame")
async def receive_frame(request: Request, frame: UploadFile = File(...)):
    """
    Decode an uploaded JPEG and push raw bytes into the inference queue.
    Returns HTTP 429 if the queue was full and the oldest frame was dropped.
    """
    state = request.app.state.detector
    raw = await frame.read()
    arr = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return JSONResponse({"error": "Could not decode frame"}, status_code=400)
    if img.ndim != 3 or img.shape[2] != 3:
        return JSONResponse({"error": f"Unexpected shape {img.shape}"}, status_code=400)

    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    queued_without_drop = enqueue_frame(state, buf.tobytes())

    if not queued_without_drop:
        return JSONResponse(
            {"status": "queued", "warning": "frame_dropped_due_to_backpressure"},
            status_code=429,
        )
    return JSONResponse({"status": "queued"})


# ── /status ───────────────────────────────────────────────────────────────────
@router.get("/status")
def get_status(request: Request):
    """Snapshot of latest detections and aggregate compliance status."""
    state = request.app.state.detector
    dets = list(state.detections)
    ppe_labels = {d["label"] for d in dets}
    active_base = {c for c in state.active_classes if not c.startswith("no ")}
    compliant = all(
        item in ppe_labels and f"no {item}" not in ppe_labels
        for item in active_base
    )
    return {"detections": dets, "compliant": compliant}


# ── /stream — MJPEG diagnostic fallback ───────────────────────────────────────
@router.get("/stream")
async def mjpeg_stream(request: Request):
    """MJPEG stream with pre-rendered bounding boxes. Diagnostic use only."""
    state = request.app.state.detector

    async def generate():
        while True:
            if await request.is_disconnected():
                break
            with state.annot_lock:
                jpeg = state.latest_annot
            if jpeg:
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
            await asyncio.sleep(0.03)  # yield event loop; not a busy-wait

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"X-Accel-Buffering": "no"},
    )


# ── /ws — WebSocket frame ingestion and result push ───────────────────────────
@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    Accept base64-JPEG frames from the frontend dashboard.
    Push detection results back to all connected clients via broadcast.

    Backpressure: frames are silently dropped (drop-oldest) when the inference
    queue is full. A structured warning is logged with the cumulative drop count.
    """
    await ws.accept()
    state = ws.app.state.detector  # type: ignore[attr-defined]
    state.ws_clients.add(ws)
    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            if msg.get("type") == "frame" and "data" in msg:
                img_bytes = base64.b64decode(msg["data"])
                arr = np.frombuffer(img_bytes, np.uint8)
                img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if img is not None and img.ndim == 3 and img.shape[2] == 3:
                    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
                    enqueue_frame(state, buf.tobytes())
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("Unexpected error in WebSocket loop", extra={"error": str(e)})
    finally:
        state.ws_clients.discard(ws)


# ── /active-classes ────────────────────────────────────────────────────────────
class ActiveClassesPayload(BaseModel):
    active_classes: list[str]


@router.post("/active-classes")
async def set_active_classes(payload: ActiveClassesPayload, request: Request):
    """
    Update which PPE classes the inference loop filters for.
    Accepts base class names (e.g. ["helmet", "gloves"]).
    Automatically expands each to include its negative form.
    Returns 400 if no valid classes are provided.
    """
    state = request.app.state.detector
    base_classes = {c.lower().strip() for c in payload.active_classes}
    valid_bases = {c for c in base_classes if c in ALLOWED_CLASSES}
    if not valid_bases:
        return JSONResponse({"error": "No valid classes provided"}, status_code=400)
    expanded: set[str] = set()
    for c in valid_bases:
        expanded.add(c)
        expanded.add(f"no {c}")
    state.active_classes = expanded
    return {"status": "ok", "active_classes": sorted(expanded)}


# ── /ppe-config ────────────────────────────────────────────────────────────────
@router.get("/ppe-config")
def ppe_config():
    """Static mapping of model class names to human-readable display labels."""
    return {
        "helmet":     "Safety Helmet",
        "gloves":     "Safety Gloves",
        "glasses":    "Safety Glasses",
        "boots":      "Safety Boots",
        "no helmet":  "Safety Helmet Missing",
        "no gloves":  "Safety Gloves Missing",
        "no glasses": "Safety Glasses Missing",
        "no boots":   "Safety Boots Missing",
    }


# ── /alarm/acknowledge ─────────────────────────────────────────────────────────
@router.post("/alarm/acknowledge")
async def alarm_acknowledge(request: Request):
    """Acknowledge an alarm event (reserved for future session logging)."""
    return {"status": "acknowledged"}
