# inference.py
# ALL model-related code lives here. No FastAPI imports.
#
# Design decisions:
#   - Uses YOLO() for model loading rather than raw OpenVINO core.read_model() /
#     core.compile_model() to keep the full pre/post-processing pipeline intact.
#     The half=False precision hint is passed at predict-time (no monkey patching).
#   - load_model() is wrapped in try/except so a bad model path surfaces as a
#     structured log rather than a raw traceback on the executor thread.
#   - enqueue_frame() centralises the drop-oldest backpressure policy. All routes
#     call this helper instead of duplicating the queue logic inline.

import asyncio
import json
import logging
import queue
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch
from ultralytics import YOLO

from state import AppState

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
IMGSZ = 640
CONF = 0.35
IOU = 0.45

ALLOWED_CLASSES = {
    "person",
    "gloves",   "no gloves",
    "glasses",  "no glasses",
    "boots",    "no boots",
    "helmet",   "no helmet",
}


# ── Backpressure helper ────────────────────────────────────────────────────────
def enqueue_frame(state: AppState, frame_bytes: bytes) -> bool:
    """
    Push a frame into the inference queue using a drop-oldest policy.

    Returns True if the frame was queued without dropping, False if the oldest
    frame was evicted to make room (backpressure event).

    The state.dropped_frames counter is incremented on each drop so that
    /health and Prometheus can surface queue pressure to operators.
    """
    try:
        state.frame_queue.put_nowait(frame_bytes)
        return True
    except queue.Full:
        try:
            state.frame_queue.get_nowait()           # discard oldest
            state.frame_queue.put_nowait(frame_bytes)  # insert newest
            state.dropped_frames += 1
            logger.warning(
                "Frame queue full — dropped oldest frame",
                extra={"dropped_frames_total": state.dropped_frames},
            )
        except queue.Empty:
            pass
        return False


# ── Device Detection ──────────────────────────────────────────────────────────
def detect_device() -> str:
    """
    Hardware-aware device selection for Windows.
    Priority: Intel OpenVINO GPU → DirectML (AMD/any DX12 GPU) → CPU.
    Returns a YOLO-compatible device string.
    """
    # ── 1. Try Intel OpenVINO ─────────────────────────────────────────────
    try:
        from openvino.runtime import Core
        from openvino.properties.device import Type

        core = Core()
        gpus = [d for d in core.available_devices if d.startswith("GPU")]
        if gpus:
            dgpus = []
            igpus = []
            for gpu in gpus:
                try:
                    dev_type = core.get_property(gpu, "DEVICE_TYPE")
                    if dev_type == Type.DISCRETE:
                        dgpus.append(gpu)
                    else:
                        igpus.append(gpu)
                except Exception:
                    igpus.append(gpu)
            selected = (dgpus or igpus)[0]
            name = core.get_property(selected, "FULL_DEVICE_NAME")
            logger.info("Intel OpenVINO GPU selected", extra={"device": selected, "name": name})
            return f"intel:{selected.lower()}"
        logger.info("OpenVINO available but no GPU found; checking DirectML")
    except ImportError:
        logger.info("OpenVINO not installed; checking DirectML")
    except Exception as e:
        logger.warning("OpenVINO probe failed; checking DirectML", extra={"error": str(e)})

    # ── 2. Try DirectML (AMD Ryzen / any DirectX 12 GPU) ──────────────────
    try:
        import onnxruntime as ort
        providers = ort.get_available_providers()
        if "DmlExecutionProvider" in providers:
            logger.info("DirectML GPU available", extra={"device": "dml:0"})
            return "dml:0"
        logger.info("DirectML provider not available in onnxruntime")
    except ImportError:
        logger.info("onnxruntime not installed; falling back to CPU")
    except Exception as e:
        logger.warning("DirectML probe failed; falling back to CPU", extra={"error": str(e)})

    # ── 3. CPU fallback ───────────────────────────────────────────────────
    logger.info("Using CPU for inference", extra={"device": "cpu"})
    return "cpu"


# ── Pure-numpy NMS (torchvision-free) ─────────────────────────────────────────
def nms(boxes: list, scores: list, iou_thresh: float) -> list:
    """Pure-numpy NMS. boxes = [[x1,y1,x2,y2], ...]. Returns kept indices."""
    if not boxes:
        return []
    b = np.array(boxes, dtype=np.float32)
    s = np.array(scores, dtype=np.float32)
    x1, y1, x2, y2 = b[:, 0], b[:, 1], b[:, 2], b[:, 3]
    areas = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    order = s.argsort()[::-1]
    kept = []
    while order.size:
        i = order[0]
        kept.append(int(i))
        if order.size == 1:
            break
        rest = order[1:]
        ix1 = np.maximum(x1[i], x1[rest])
        iy1 = np.maximum(y1[i], y1[rest])
        ix2 = np.minimum(x2[i], x2[rest])
        iy2 = np.minimum(y2[i], y2[rest])
        inter = np.maximum(0, ix2 - ix1) * np.maximum(0, iy2 - iy1)
        union = areas[i] + areas[rest] - inter
        iou = inter / np.maximum(union, 1e-9)
        order = rest[iou <= iou_thresh]
    return kept


# ── Model loader ───────────────────────────────────────────────────────────────
def load_model(model_path: str, device: str) -> tuple[Any, str]:
    """
    Load the YOLO model. Returns (model, resolved_device).

    Strategy:
    - GPU path: OpenVINO model with a noise sanity check. Falls through to CPU
      if the sanity check detects false positives (known request-pool bug).
    - CPU path: best.pt (PyTorch). Stable for sequential inference.

    Raises:
        FileNotFoundError: if neither best_openvino_model/ nor best.pt exists.
        RuntimeError: propagated after structured logging so the executor
                      future captures it for the lifespan teardown to inspect.
    """
    base = Path(model_path)
    ov_dir = base if base.is_dir() else base.parent / "best_openvino_model"
    pt = base.parent / "best.pt"

    rng = np.random.RandomState(42)
    dummy = rng.randint(0, 256, (IMGSZ, IMGSZ, 3), dtype=np.uint8)

    # ── GPU path: OpenVINO only ────────────────────────────────────────────
    if device != "cpu" and ov_dir.exists():
        logger.info("Trying OpenVINO model", extra={"device": device, "path": str(ov_dir)})
        try:
            m = YOLO(str(ov_dir), task="detect")
            res = m.predict(dummy, device=device, imgsz=IMGSZ, verbose=False)
            n = len(res[0].boxes) if res[0].boxes is not None else 0
            if n > 0:
                raise RuntimeError(f"GPU sanity check failed: {n} detections on noise frame")
            logger.info("OpenVINO GPU model loaded successfully", extra={"device": device})
            return m, device
        except Exception as e:
            logger.warning(
                "OpenVINO GPU failed; falling back to CPU",
                extra={"error": str(e)},
            )

    # ── CPU path: best.pt (PyTorch) ───────────────────────────────────────
    if pt.exists():
        logger.info("Loading best.pt on CPU", extra={"path": str(pt)})
        try:
            m = YOLO(str(pt), task="detect")
            m.predict(dummy, device="cpu", imgsz=IMGSZ, verbose=False)
            logger.info("best.pt CPU warm-up OK")
            return m, "cpu"
        except Exception as e:
            logger.error("Failed to load best.pt", extra={"error": str(e)})
            raise

    raise FileNotFoundError(
        "No usable model found. Need best_openvino_model/ (GPU) or best.pt (CPU) "
        "in the same directory as main.py."
    )


# ── Inference loop ─────────────────────────────────────────────────────────────
def inference_loop(
    state: AppState, model_path: str, initial_device: str, inference_timeout: float
) -> None:
    """
    Blocking inference loop executed inside a ThreadPoolExecutor worker.

    - Model is loaded HERE so OpenVINO binds its compiled request buffers
      to this thread (thread-affinity requirement).
    - Crash-protected: single-frame exceptions are caught and logged; the loop
      continues running to avoid dropping the entire session on a bad frame.
    - Exits cleanly when state.shutdown_event is set and the frame queue is drained.
    """
    logger.info("Inference loop started")

    try:
        model, device = load_model(model_path, initial_device)
    except Exception as e:
        logger.error("Model load failed; inference loop exiting", extra={"error": str(e)})
        return

    state.model = model

    while not state.shutdown_event.is_set():
        try:
            frame_bytes = state.frame_queue.get(timeout=inference_timeout)
        except queue.Empty:
            continue  # timeout — re-check shutdown_event

        if frame_bytes is None:
            # Sentinel pushed by lifespan teardown for immediate unblock.
            logger.info("Received shutdown sentinel; exiting inference loop")
            break

        try:
            arr = np.frombuffer(frame_bytes, np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None or img.ndim != 3 or img.shape[2] != 3:
                raise ValueError(f"Invalid frame shape after decode: {getattr(img, 'shape', None)}")

            results = model.predict(img, device=device, imgsz=IMGSZ, conf=CONF, verbose=False)
            r = results[0]

            # Filter detections — normalise underscores to spaces (model uses both)
            raw_boxes, raw_scores, raw_labels, raw_cls_ids = [], [], [], []
            if r.boxes is not None and len(r.boxes):
                for i, cls_id in enumerate(r.boxes.cls.tolist()):
                    cls_name = r.names[int(cls_id)].lower().strip().replace("_", " ")
                    if cls_name in state.active_classes or cls_name == "person":
                        raw_boxes.append(r.boxes.xyxy[i].tolist())
                        raw_scores.append(float(r.boxes.conf[i]))
                        raw_labels.append(cls_name)
                        raw_cls_ids.append(i)

            # Per-class NMS
            kept_idx: set = set()
            for lbl in set(raw_labels):
                cls_indices = [k for k, l in enumerate(raw_labels) if l == lbl]
                kept_local = nms(
                    [raw_boxes[k] for k in cls_indices],
                    [raw_scores[k] for k in cls_indices],
                    IOU,
                )
                for k in kept_local:
                    kept_idx.add(cls_indices[k])

            dets = [
                {
                    "label":      raw_labels[k],
                    "confidence": raw_scores[k],
                    "bbox":       [round(v, 1) for v in raw_boxes[k]],
                }
                for k in sorted(kept_idx)
            ]

            # Re-filter r.boxes to kept detections for annotation
            if kept_idx:
                idx = torch.tensor(
                    [raw_cls_ids[k] for k in sorted(kept_idx)],
                    dtype=torch.long,
                    device=r.boxes.cls.device,
                )
                r.boxes = r.boxes[idx]
            else:
                r.boxes = None

            annotated = r.plot(line_width=2, font_size=14)
            _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])

            with state.annot_lock:
                state.latest_annot = buf.tobytes()
            state.detections = dets

            # Broadcast to all WebSocket clients
            if state.ws_clients and state.ws_loop is not None:
                payload = json.dumps({
                    "type":       "detection_frame",
                    "timestamp":  time.time(),
                    "detections": dets,
                })
                asyncio.run_coroutine_threadsafe(
                    _broadcast(state, payload), state.ws_loop
                )

        except Exception as e:
            # Log full traceback; reset state; continue loop — never crash the thread.
            logger.exception("Inference failure on frame", extra={"error": str(e)})
            state.detections = []
            with state.annot_lock:
                state.latest_annot = None

    logger.info("Inference loop exited cleanly")


async def _broadcast(state: AppState, message: str) -> None:
    """Send message to all connected WS clients; removes dead connections."""
    dead = set()
    for ws in list(state.ws_clients):
        try:
            await ws.send_text(message)
        except Exception:
            dead.add(ws)
    state.ws_clients.difference_update(dead)
