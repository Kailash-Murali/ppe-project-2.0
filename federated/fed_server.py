# fed_server.py
# Flower server running FedAvg for PPE Detection
import argparse
import csv
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import flwr as fl
import torch
from ultralytics import YOLO

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fed_config import MODEL_PATH


def weighted_metrics_average(metrics: List[Tuple[int, Dict]]) -> Dict:
    """Aggregate evaluation metrics (mAP50, mAP50-95) across clients."""
    total_examples = sum(num_examples for num_examples, _ in metrics)
    if total_examples == 0:
        return {}

    weighted_map50 = sum(num_examples * m.get("mAP50", 0.0) for num_examples, m in metrics) / total_examples
    weighted_map50_95 = sum(num_examples * m.get("mAP50-95", 0.0) for num_examples, m in metrics) / total_examples

    return {
        "mAP50": round(float(weighted_map50), 4),
        "mAP50-95": round(float(weighted_map50_95), 4),
    }


class FedAvgSaveModelStrategy(fl.server.strategy.FedAvg):
    """
    Subclass FedAvg to intercept and capture aggregated parameters,
    saving the global checkpoint at the end of federated training.
    """

    def __init__(self, output_checkpoint: str = "federated_global.pt", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.output_checkpoint = output_checkpoint
        self.latest_weights: Optional[List] = None

    def aggregate_fit(
        self,
        server_round: int,
        results: List[Tuple[fl.server.client_proxy.ClientProxy, fl.common.FitRes]],
        failures: List[BaseException],
    ) -> Tuple[Optional[fl.common.Parameters], Dict]:
        agg_params, agg_metrics = super().aggregate_fit(server_round, results, failures)
        if agg_params is not None:
            self.latest_weights = fl.common.parameters_to_ndarrays(agg_params)
            print(f"--- Round {server_round}: Aggregated weights from {len(results)} client(s) ---")
        return agg_params, agg_metrics

    def save_global_model(self):
        if self.latest_weights is None:
            print("Warning: No aggregated weights available to save.")
            return

        print(f"Saving final aggregated weights into {self.output_checkpoint}...")
        base_model = YOLO(MODEL_PATH, task="detect")
        state_dict = base_model.model.state_dict()
        new_state = {k: torch.tensor(v) for k, v in zip(state_dict.keys(), self.latest_weights)}
        base_model.model.load_state_dict(new_state, strict=True)
        base_model.save(self.output_checkpoint)
        print(f"Successfully saved federated global checkpoint: {self.output_checkpoint}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Flower FedAvg Server for PPE Detection")
    parser.add_argument("--rounds", type=int, default=5, help="Number of FedAvg rounds (e.g. 2 for dryrun, 5-10 for full)")
    parser.add_argument("--min-clients", type=int, default=2, help="Minimum number of active clients required")
    parser.add_argument("--port", type=str, default="8080", help="Port to bind server")
    parser.add_argument("--output", type=str, default="federated_global.pt", help="Path to save global checkpoint")
    parser.add_argument("--log-csv", type=str, default="fedavg_metrics.csv", help="Path to write per-round metrics CSV")
    args = parser.parse_args()

    strategy = FedAvgSaveModelStrategy(
        output_checkpoint=args.output,
        min_fit_clients=args.min_clients,
        min_evaluate_clients=args.min_clients,
        min_available_clients=args.min_clients,
        evaluate_metrics_aggregation_fn=weighted_metrics_average,
    )

    print(f"Starting Flower server on 0.0.0.0:{args.port} for {args.rounds} rounds...")
    history = fl.server.start_server(
        server_address=f"0.0.0.0:{args.port}",
        config=fl.server.ServerConfig(num_rounds=args.rounds),
        strategy=strategy,
    )

    # Save final global model
    strategy.save_global_model()

    # Log metrics to CSV
    log_file = Path(args.log_csv)
    with open(log_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["round", "metric", "value"])
        writer.writeheader()

        for metric_name, entries in history.metrics_distributed.items():
            for r, val in entries:
                writer.writerow({"round": r, "metric": metric_name, "value": val})

    print(f"Metrics saved to {log_file.resolve()}.")
