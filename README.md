# Bray PPE Monitor — PoC v1

The **Bray PPE Monitor** is a real-time compliance tracking system designed to monitor personnel safety equipment inside industrial sites, laboratories, or construction zones. The system uses a webcam feed or stationary IP cameras, automatically detects whether active workers are wearing required Personal Protective Equipment (PPE), and flags violations instantly.

The project consists of a high-performance **FastAPI (Python) backend** running a YOLOv8 object detection model inside a `ThreadPoolExecutor` worker thread, and a modern **React (Vite + TS) dashboard** showing the camera feed, bounding box overlays, real-time compliance statuses, and voice safety alerts.

---

## Project Structure

```
v1/
├── backend/                  # FastAPI inference server
│   ├── main.py               # Web server entrypoint
│   ├── inference.py          # Model loading, inference loop, NMS
│   ├── state.py              # GIL-safe thread state sharing
│   ├── config.py             # Settings using Pydantic Settings
│   ├── best_openvino_model/  # OpenVINO model directory (GPU path)
│   ├── best.pt               # PyTorch fallback model (CPU path)
│   ├── requirements.txt      # Python dependencies
│   └── .env                  # Backend configuration
└── frontend/                 # React + Vite + TypeScript dashboard
    ├── src/
    │   ├── app/
    │   │   ├── App.tsx
    │   │   ├── components/LiveDetection/    # Live Detection dashboard components
    │   │   │   ├── CameraPanel.tsx          # Camera feed & bounding box overlays
    │   │   │   ├── CompliancePanel.tsx      # Sidebar checklist monitor
    │   │   │   ├── PPEControlsPanel.tsx      # PPE category checkboxes
    │   │   │   ├── hooks/                   # Custom business logic hooks
    │   │   │   │   ├── useCamera.ts         # Webcam control
    │   │   │   │   ├── useBackend.ts        # WebSocket connection
    │   │   │   │   ├── useAlarm.ts          # Alarm audio context
    │   │   │   │   └── useDetection.ts      # Compliance & violation logic
    │   │   │   └── types.ts                 # Shared Typescript definitions
    │   │   └── theme.ts
    │   └── main.tsx
    ├── package.json
    └── .env                  # Frontend configuration
```

---

## 1. Quick Start

### 1.1 Backend Setup & Run

The backend requires Python 3.10+. Follow these steps to set up a virtual environment and run the server:

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Create a Python virtual environment**:
   ```bash
   python -m venv venv
   ```

3. **Activate the virtual environment**:
   * **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   * **Windows (Command Prompt)**:
     ```cmd
     venv\Scripts\activate.bat
     ```
   * **macOS / Linux**:
     ```bash
     source venv/bin/activate
     ```

4. **Install backend dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

5. **Start the FastAPI server**:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 60
   ```

The backend server will run on `http://localhost:8000`.

### 1.2 Frontend Setup & Run

The frontend requires Node.js 18+. Follow these steps to install dependencies and run the dashboard:

1. **Navigate to the frontend directory**:
   ```bash
   cd ../frontend
   ```

2. **Install Node.js packages**:
   ```bash
   npm install
   ```

3. **Start the Vite development server**:
   ```bash
   npm run dev
   ```
   The server is served over **HTTPS** (`https://localhost:5173`) to allow camera access from other machines on the local network. Accept the self-signed certificate warning in your browser on first launch.

---

## 2. Configuration Settings

Both frontend and backend are configured via local `.env` files.

### 2.1 Backend Environment (`backend/.env`)
Ensure `backend/.env` contains the following configurations:
```env
MODEL_PATH=best_openvino_model     # Model directory or .pt file path
MODEL_DEVICE=AUTO                  # AUTO, GPU, or CPU
FRAME_QUEUE_SIZE=10                # Maximum frames in processing queue
INFERENCE_TIMEOUT=0.5             # Queue read timeout in seconds
EXECUTOR_WORKERS=1                # ThreadPoolExecutor worker count (keep 1 for OpenVINO)
LOG_LEVEL=INFO                    # Structured log level: DEBUG, INFO, WARNING, ERROR
CORS_ALLOWED_ORIGINS=["*"]        # Restrict to specific origins in production
```

### 2.2 Frontend Environment (`frontend/.env`)
Ensure `frontend/.env` matches the backend server endpoints:
```env
VITE_BACKEND_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

---

## 3. Detected PPE Classes

The system evaluates compliance based on the presence of the present class (`helmet`) and the absence of the violation class (`no helmet`):

| PPE Category | Present Class Name | Violation Class Name | Display Label |
| :--- | :--- | :--- | :--- |
| **Gloves** | `gloves` | `no gloves` | Safety Gloves |
| **Eyewear** | `glasses` | `no glasses` | Safety Glasses |
| **Shoes** | `boots` | `no boots` | Safety Boots |
| **Helmet** | `helmet` | `no helmet` | Safety Helmet |

* **Compliance**: Evaluated as `Present Class` is detected **AND** `Violation Class` is **NOT** detected.
* **Bounding Boxes**: Green boxes represent present PPE items; Red boxes highlight safety violations.

---

## 4. API Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Check backend server health, config, and runtime telemetry (`dropped_frames`, `ws_client_count`). |
| `POST` | `/active-classes` | Configure active classes monitored during this session. |
| `GET` | `/status` | Retrieve snapshot of latest detections and compliance status. |
| `GET` | `/stream` | Fetch annotated MJPEG streaming feed (diagnostic fallback). |
| `POST` | `/alarm/acknowledge` | Acknowledge and silence the active voice alert. |
| `GET` | `/metrics` | Prometheus scrape endpoint (unauthenticated; internal network only). |
| `WebSocket` | `/ws` | Stream live camera frames (base64) and receive detection frames. |

---

## 5. Further Documentation
For deep-dives into functionality, business rules, and developer architecture, refer to:
* **Functional overview**: [functional.md](file:///c:/Users/Kailash/Desktop/Internship/BrayPPE/poc/v1/functional.md)
* **Technical details**: [technical.md](file:///c:/Users/Kailash/Desktop/Internship/BrayPPE/poc/v1/technical.md)
