# eval_comparison.py
# 4-way evaluation matrix comparing Solo Node A, Solo Node B, Base, and FedAvg Global
import argparse
import csv
from pathlib import Path
from typing import Dict
from ultralytics import YOLO


def evaluate_model_on_zone(model_path: str, data_yaml: str, device: str = "cpu") -> Dict[str, float]:
    """Run validation for a checkpoint on a specified zone dataset."""
    m = YOLO(model_path, task="detect")
    metrics = m.val(data=data_yaml, imgsz=640, device=device, verbose=False)
    return {
        "mAP50": round(float(metrics.box.map50), 4),
        "mAP50-95": round(float(metrics.box.map), 4),
        "Precision": round(float(metrics.box.mp), 4),
        "Recall": round(float(metrics.box.mr), 4),
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate PPE checkpoints across zones")
    parser.add_argument("--zone-a", default="data/node_a/data.yaml", help="Path to Node A data.yaml")
    parser.add_argument("--zone-b", default="data/node_b/data.yaml", help="Path to Node B data.yaml")
    parser.add_argument("--solo-a", default="fed_baseline/nodeA_local/weights/best.pt", help="Node A solo checkpoint")
    parser.add_argument("--solo-b", default="fed_baseline/nodeB_local/weights/best.pt", help="Node B solo checkpoint")
    parser.add_argument("--fedavg", default="federated_global.pt", help="FedAvg global checkpoint")
    parser.add_argument("--base", default="../backend/best.pt", help="Original base checkpoint")
    parser.add_argument("--output-csv", default="comparison_table.csv", help="Output CSV path")
    args = parser.parse_args()

    candidates = {
        "Original Base Model": args.base,
        "Node A Solo Model": args.solo_a,
        "Node B Solo Model": args.solo_b,
        "FedAvg Global Model": args.fedavg,
    }

    zones = {
        "Zone A (Validation)": args.zone_a,
        "Zone B (Validation)": args.zone_b,
    }

    results = []
    print("\n" + "=" * 78)
    print("FOUR-WAY EVALUATION MATRIX (Cross-Zone Performance)")
    print("=" * 78)

    for model_name, model_path in candidates.items():
        p = Path(model_path)
        if not p.exists():
            print(f"[SKIP] {model_name}: checkpoint '{model_path}' not found.")
            continue

        for zone_name, zone_yaml in zones.items():
            z = Path(zone_yaml)
            if not z.exists():
                print(f"[SKIP] {zone_name}: dataset config '{zone_yaml}' not found.")
                continue

            print(f"Evaluating {model_name} on {zone_name}...")
            scores = evaluate_model_on_zone(str(p), str(z))
            row = {
                "Model": model_name,
                "Evaluation Zone": zone_name,
                "mAP50": scores["mAP50"],
                "mAP50-95": scores["mAP50-95"],
                "Precision": scores["Precision"],
                "Recall": scores["Recall"],
            }
            results.append(row)

    if results:
        # Write CSV
        with open(args.output_csv, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["Model", "Evaluation Zone", "mAP50", "mAP50-95", "Precision", "Recall"])
            writer.writeheader()
            writer.writerows(results)

        print("\nSUMMARY RESULTS:")
        print(f"{'Model':<24} | {'Evaluation Zone':<22} | {'mAP50':<8} | {'mAP50-95':<8}")
        print("-" * 72)
        for r in results:
            print(f"{r['Model']:<24} | {r['Evaluation Zone']:<22} | {r['mAP50']:<8.4f} | {r['mAP50-95']:<8.4f}")
        print(f"\nReport written to {Path(args.output_csv).resolve()}")
    else:
        print("No evaluations completed. Ensure checkpoints and data.yaml files exist.")


if __name__ == "__main__":
    main()
