"""
import_artifacts.py
Automatically unpacks 'federated_artifacts.zip' downloaded from Google Colab,
deploys the OpenVINO model to backend, places federated checkpoints, and
updates frontend/src/app/components/ModelMetrics/ModelMetrics.tsx.
"""
import csv
import json
import os
import re
import shutil
import sys
import zipfile
from pathlib import Path

# Safe stdout for Windows CP1252
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent

def find_zip():
    # Check in project root
    local_zip = PROJECT_ROOT / "federated_artifacts.zip"
    if local_zip.exists():
        return local_zip
    
    # Check in user Downloads
    downloads_zip = Path.home() / "Downloads" / "federated_artifacts.zip"
    if downloads_zip.exists():
        return downloads_zip
        
    return None

def extract_and_deploy(zip_path: Path):
    print(f"[FOUND] Archive: {zip_path}")
    print("Extracting artifacts into project...")
    
    with zipfile.ZipFile(zip_path, "r") as z:
        for member in z.namelist():
            target_path = PROJECT_ROOT / member
            target_path.parent.mkdir(parents=True, exist_ok=True)
            with z.open(member) as src, open(target_path, "wb") as dst:
                shutil.copyfileobj(src, dst)
            print(f"  [OK] Extracted: {member}")
            
    print("\n[SUCCESS] All files deployed:")
    print("  - Backend OpenVINO model: backend/best_openvino_model/")
    print("  - PyTorch weights: federated/federated_global.pt")
    print("  - Metrics: federated/comparison_table.csv & fedavg_metrics.csv")
    
    # Update ModelMetrics.tsx if comparison_table.csv exists
    table_csv = PROJECT_ROOT / "federated" / "comparison_table.csv"
    if table_csv.exists():
        update_model_metrics(table_csv)

def update_model_metrics(csv_path: Path):
    metrics_ts = PROJECT_ROOT / "frontend" / "src" / "app" / "components" / "ModelMetrics" / "ModelMetrics.tsx"
    if not metrics_ts.exists():
        print("[SKIP] ModelMetrics.tsx not found, skipping frontend update.")
        return
        
    rows = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
            
    if not rows:
        return
        
    print("\nUpdating frontend/src/app/components/ModelMetrics/ModelMetrics.tsx with real metrics...")
    
    fed_rows = [r for r in rows if r["Model"] == "FedAvg Global Model"]
    base_rows = [r for r in rows if r["Model"] == "Original Base Model"]
    
    if fed_rows and base_rows:
        def avg(row_list, key):
            vals = [float(r[key]) for r in row_list if key in r]
            return round(sum(vals) / len(vals) * 100, 1) if vals else 0.0

        fed_map50 = avg(fed_rows, "mAP50")
        fed_map50_95 = avg(fed_rows, "mAP50-95")
        fed_prec = avg(fed_rows, "Precision")
        fed_rec = avg(fed_rows, "Recall")
        
        base_map50 = avg(base_rows, "mAP50")
        base_map50_95 = avg(base_rows, "mAP50-95")
        base_prec = avg(base_rows, "Precision")
        base_rec = avg(base_rows, "Recall")
        
        new_overall = f"""const OVERALL_METRICS: OverallMetric[] = [
  {{ label: 'mAP50',      unit: '%', baseline: {base_map50}, federated: {fed_map50} }},
  {{ label: 'mAP50-95',  unit: '%', baseline: {base_map50_95}, federated: {fed_map50_95} }},
  {{ label: 'Precision', unit: '%', baseline: {base_prec}, federated: {fed_prec} }},
  {{ label: 'Recall',    unit: '%', baseline: {base_rec}, federated: {fed_rec} }},
];"""

        text = metrics_ts.read_text(encoding="utf-8")
        text = re.sub(
            r"const OVERALL_METRICS: OverallMetric\[\] = \[\s*\{[\s\S]*?\}\s*\];",
            new_overall,
            text
        )
        
        metrics_ts.write_text(text, encoding="utf-8")
        print("  [OK] Updated OVERALL_METRICS in ModelMetrics.tsx!")

if __name__ == "__main__":
    zip_file = find_zip()
    if not zip_file:
        print("[!] Could not find 'federated_artifacts.zip' in project folder or Downloads.")
        print("Please place the downloaded 'federated_artifacts.zip' in:")
        print(f"  {PROJECT_ROOT}")
        print("and re-run: python import_artifacts.py")
    else:
        extract_and_deploy(zip_file)
