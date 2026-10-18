# export_to_openvino.py
# Re-exports the federated global checkpoint (PyTorch) to OpenVINO IR and updates backend
import argparse
import shutil
from pathlib import Path
from ultralytics import YOLO


def export_and_deploy(
    pt_path: str = "federated_global.pt",
    target_dir: str = "../backend/best_openvino_model",
    backup: bool = True,
):
    pt_file = Path(pt_path).resolve()
    if not pt_file.exists():
        raise FileNotFoundError(f"Checkpoint '{pt_file}' not found. Run federated training first.")

    target_path = Path(target_dir).resolve()
    print(f"Loading {pt_file} into YOLO...")
    model = YOLO(str(pt_file), task="detect")

    print("Exporting model to OpenVINO IR (imgsz=640, half=False)...")
    exported_path = model.export(format="openvino", imgsz=640, half=False, dynamic=False)
    exported_dir = Path(exported_path)

    if not exported_dir.exists():
        raise RuntimeError(f"Export directory '{exported_dir}' was not created.")

    print(f"Export created at: {exported_dir}")

    # Backup existing openvino model directory if requested
    if target_path.exists() and backup:
        backup_dir = target_path.parent / f"{target_path.name}_backup"
        if not backup_dir.exists():
            print(f"Backing up existing OpenVINO model to {backup_dir}...")
            shutil.copytree(target_path, backup_dir)

    print(f"Deploying new OpenVINO IR files to {target_path}...")
    target_path.mkdir(parents=True, exist_ok=True)
    for item in exported_dir.iterdir():
        dest = target_path / item.name
        if item.is_file():
            shutil.copy2(item, dest)
            print(f"  Copied {item.name} -> {dest}")

    print("Successfully deployed federated model to backend!")
    print("The backend inference server will use this updated model on next startup or reload.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export federated checkpoint to OpenVINO")
    parser.add_argument("--model", default="federated_global.pt", help="Path to federated PyTorch checkpoint")
    parser.add_argument("--target", default="../backend/best_openvino_model", help="Path to backend OpenVINO model directory")
    parser.add_argument("--no-backup", action="store_true", help="Do not create backup of existing model")
    args = parser.parse_args()

    export_and_deploy(pt_path=args.model, target_dir=args.target, backup=not args.no_backup)
