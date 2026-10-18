# fed_config.py
# Shared constants for Federated Learning (PPE Project 2.0)
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
MODEL_PATH = str((BACKEND_DIR / "best.pt").resolve())

NUM_CLASSES = 11
IMGSZ = 640
EPOCHS_PER_ROUND = 3
BATCH = 8
SEED = 42

DEFAULT_PORT = "8088"
DEFAULT_SERVER = f"127.0.0.1:{DEFAULT_PORT}"


# 11-Class list from backend/best_openvino_model/metadata.yaml - Single source of truth
CLASS_NAMES = {
    0: "boots",
    1: "glasses",
    2: "gloves",
    3: "helmet",
    4: "no boots",
    5: "no glasses",
    6: "no gloves",
    7: "no helmet",
    8: "no vest",
    9: "person",
    10: "vest",
}
