# fed_client.py
# Flower client wrapping Ultralytics YOLOv8 for PPE Detection federated learning
import argparse
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import flwr as fl
import numpy as np
import torch
from ultralytics import YOLO

# Add parent to path if needed
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fed_config import BATCH, EPOCHS_PER_ROUND, IMGSZ, MODEL_PATH, SEED


def get_weights(model: YOLO) -> List[np.ndarray]:
    """Extract PyTorch model state_dict weights as numpy arrays."""
    return [val.detach().cpu().numpy() for val in model.model.state_dict().values()]


def set_weights(model: YOLO, weights: List[np.ndarray]) -> None:
    """Load numpy arrays back into the PyTorch model state_dict."""
    state_dict = model.model.state_dict()
    params_dict = zip(state_dict.keys(), weights)
    new_state = {k: torch.tensor(v, device=model.model.device if hasattr(model.model, "device") else "cpu") for k, v in params_dict}
    model.model.load_state_dict(new_state, strict=True)


class PPEClient(fl.client.NumPyClient):
    """
    Flower client that performs local training on zone data
    starting from PyTorch baseline (best.pt).
    """

    def __init__(self, data_yaml: str, node_id: str, device: str = "cpu"):
        self.data_yaml = str(Path(data_yaml).resolve())
        self.node_id = node_id
        self.device = device
        # Load from PyTorch best.pt (NOT OpenVINO IR, which cannot be trained)
        print(f"[{self.node_id}] Loading base model from {MODEL_PATH}...")
        self.model = YOLO(MODEL_PATH, task="detect")
        print(f"[{self.node_id}] Base model loaded successfully.")

    def get_parameters(self, config: Dict) -> List[np.ndarray]:
        return get_weights(self.model)

    def fit(
        self, parameters: List[np.ndarray], config: Dict
    ) -> Tuple[List[np.ndarray], int, Dict]:
        print(f"[{self.node_id}] Receiving global model weights and starting local fit...")
        set_weights(self.model, parameters)

        # Train local model for specified epochs
        self.model.train(
            data=self.data_yaml,
            epochs=EPOCHS_PER_ROUND,
            imgsz=IMGSZ,
            batch=BATCH,
            seed=SEED,
            device=self.device,
            verbose=False,
            project="fed_runs",
            name=f"{self.node_id}_training",
            exist_ok=True,
        )

        updated_weights = get_weights(self.model)
        # Approximate number of training samples/steps
        num_examples = 100
        print(f"[{self.node_id}] Local fit completed.")
        return updated_weights, num_examples, {}

    def evaluate(
        self, parameters: List[np.ndarray], config: Dict
    ) -> Tuple[float, int, Dict]:
        print(f"[{self.node_id}] Evaluating current parameters...")
        set_weights(self.model, parameters)
        metrics = self.model.val(
            data=self.data_yaml,
            imgsz=IMGSZ,
            device=self.device,
            verbose=False,
            project="fed_runs",
            name=f"{self.node_id}_eval",
            exist_ok=True,
        )

        map50 = float(metrics.box.map50)
        map50_95 = float(metrics.box.map)
        loss = 1.0 - map50
        num_examples = len(metrics.names) if hasattr(metrics, "names") else 10
        print(f"[{self.node_id}] Eval complete: mAP50={map50:.4f}, mAP50-95={map50_95:.4f}")
        return loss, num_examples, {"mAP50": map50, "mAP50-95": map50_95}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Flower Client for PPE Detection")
    parser.add_argument("--data", required=True, help="Path to data.yaml (e.g. data/node_a/data.yaml or coco8.yaml)")
    parser.add_argument("--node-id", required=True, help="Identifier: node_a, node_b, etc.")
    parser.add_argument("--server", default="127.0.0.1:8080", help="Flower server host:port")
    parser.add_argument("--device", default="auto", help="cpu, 0 (GPU), or auto")
    args = parser.parse_args()

    selected_device = args.device
    if selected_device == "auto":
        selected_device = 0 if torch.cuda.is_available() else "cpu"

    client = PPEClient(data_yaml=args.data, node_id=args.node_id, device=str(selected_device))
    print(f"Starting Flower NumPyClient connecting to {args.server}...")
    fl.client.start_numpy_client(server_address=args.server, client=client)
