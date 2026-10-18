# Federated Learning Module (PPE Project 2.0)

This module implements Federated Averaging (FedAvg) using Flower (`flwr`) and Ultralytics YOLOv8 for PPE compliance monitoring across distributed zones.

---

## 1. Class List (Single Source of Truth)

Extracted directly from `backend/best_openvino_model/metadata.yaml`:

```
0: boots        4: no boots     8: no vest
1: glasses      5: no glasses   9: person
2: gloves       6: no gloves    10: vest
3: helmet       7: no helmet
```

All `data.yaml` configs must strictly follow this ordering.

---

## 2. Directory Layout

```
federated/
├── fed_config.py          # Centralized configuration & constants
├── fed_server.py          # Flower server with FedAvg & automatic model saving
├── fed_client.py          # Flower client wrapping YOLOv8 fit/evaluate
├── eval_comparison.py     # 4-way cross-zone evaluation comparison
├── export_to_openvino.py  # Re-exports federated PyTorch checkpoint to OpenVINO IR
├── requirements_fed.txt   # Dependencies
└── data/
    ├── node_a/            # Zone A dataset (data.yaml, images, labels)
    └── node_b/            # Zone B dataset (data.yaml, images, labels)
```

---

## 3. Workflow

### Step 1: Solo Training Baselines (Teammate A)
Train Zone A and Zone B independently:
```powershell
# Zone A
yolo detect train model=../backend/best.pt data=data/node_a/data.yaml epochs=15 imgsz=640 batch=8 seed=42 name=nodeA_local project=../fed_baseline

# Zone B
yolo detect train model=../backend/best.pt data=data/node_b/data.yaml epochs=15 imgsz=640 batch=8 seed=42 name=nodeB_local project=../fed_baseline
```

### Step 2: Federated Training (Teammate B)
Start server and clients:
```powershell
# Terminal 1 - Server
python fed_server.py --rounds 5 --min-clients 2

# Terminal 2 - Node A Client
python fed_client.py --data data/node_a/data.yaml --node-id node_a

# Terminal 3 - Node B Client
python fed_client.py --data data/node_b/data.yaml --node-id node_b
```
Outputs:
- `federated_global.pt` (Aggregated global weights)
- `fedavg_metrics.csv` (Per-round metrics)

### Step 3: 4-Way Cross-Zone Comparison (Lead / You)
```powershell
python eval_comparison.py --zone-a data/node_a/data.yaml --zone-b data/node_b/data.yaml
```
Outputs `comparison_table.csv` comparing solo vs federated models across zones.

### Step 4: Export to OpenVINO & Deploy to Dashboard (Lead / You)
```powershell
python export_to_openvino.py --model federated_global.pt
```
This automatically backs up and replaces `backend/best_openvino_model/`.
Restart the backend server to run the live dashboard with the new federated model!
