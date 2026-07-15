"""
Confidence score inspector for selected PPE classes.

Runs best.pt on TEST.png (or any image you pass) and prints a clean
breakdown of per-class confidence scores — both raw model output and
after the ALLOWED_CLASSES filter + NMS that the server applies.

Usage:
    python inspect_conf.py              # uses TEST.png
    python inspect_conf.py <image.jpg>  # uses your image
"""
import sys
import cv2
import numpy as np
from ultralytics import YOLO

MODEL_PATH = "best.pt"
IMGSZ      = 640
CONF_THRESH = 0.10   # low threshold to see all candidates
IOU_THRESH  = 0.45

ALLOWED_CLASSES = {
    "gloves", "no gloves",
    "glasses", "no glasses",
    "boots", "no boots",
    "helmet", "no helmet",
}

# ── Load model ────────────────────────────────────────────────────────────────
print(f"Loading {MODEL_PATH} on CPU...")
model = YOLO(MODEL_PATH, task="detect")
dummy = np.zeros((640, 640, 3), dtype=np.uint8)
model.predict(dummy, device="cpu", imgsz=IMGSZ, verbose=False)   # warm-up
print("Warm-up OK\n")

# ── Load image ────────────────────────────────────────────────────────────────
img_path = sys.argv[1] if len(sys.argv) > 1 else "TEST.png"
img = cv2.imread(img_path)
if img is None:
    print(f"ERROR: could not load '{img_path}'")
    sys.exit(1)
print(f"Image: {img_path}  shape={img.shape}  (H x W x C)\n")

# ── Run inference with a very low conf to see everything ─────────────────────
results = model.predict(img, device="cpu", imgsz=IMGSZ, conf=CONF_THRESH,
                        iou=IOU_THRESH, verbose=False)
r = results[0]

class_names = model.names   # {int: str}

print("=" * 60)
print(f"RAW detections (conf ≥ {CONF_THRESH}): {len(r.boxes) if r.boxes is not None else 0}")
print("=" * 60)

if r.boxes is None or len(r.boxes) == 0:
    print("  (none)\n")
else:
    # Group by class
    by_class: dict[str, list[float]] = {}
    for box in r.boxes:
        label = class_names[int(box.cls)]
        conf  = float(box.conf)
        by_class.setdefault(label, []).append(conf)

    # Print all classes sorted by max confidence descending
    rows = sorted(by_class.items(), key=lambda kv: max(kv[1]), reverse=True)
    for label, confs in rows:
        marker = "✅" if label in ALLOWED_CLASSES else "⬜"
        confs_str = "  ".join(f"{c:.3f}" for c in sorted(confs, reverse=True))
        print(f"  {marker}  {label:<15}  [{confs_str}]")

print()
print("=" * 60)
print(f"AFTER ALLOWED_CLASSES filter (server_conf ≥ 0.35):")
print("=" * 60)
allowed_dets = []
if r.boxes is not None:
    for box in r.boxes:
        label = class_names[int(box.cls)]
        conf  = float(box.conf)
        if label in ALLOWED_CLASSES and conf >= 0.35:
            bbox = box.xyxy[0].tolist()
            allowed_dets.append((label, conf, bbox))

allowed_dets.sort(key=lambda x: x[1], reverse=True)
if allowed_dets:
    for label, conf, bbox in allowed_dets:
        x1, y1, x2, y2 = [round(v, 1) for v in bbox]
        print(f"  {label:<15}  conf={conf:.3f}  bbox=[{x1},{y1},{x2},{y2}]")
else:
    print("  (none passed both filters)")
