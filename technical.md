# Technical Specification: Bray PPE Monitor (PoC v1)

This document details the system architecture, backend inference pipeline, frontend component state, and communication protocols of the **Bray PPE Monitor**.

---

## 1. System Architecture

The project is structured as a client-server web application separating the high-performance inference engine from the user interface:

```mermaid
graph TD
    A[React Frontend] <-->|WebSocket: base64 frames & JSON results| B[FastAPI Backend]
    B -->|Frame Queue| C[ThreadPoolExecutor Worker]
    C -->|YOLOv8 Predict| D[Intel OpenVINO GPU / PyTorch CPU]
    A -->|REST APIs| B
    B -->|Prometheus scrape| E[/metrics endpoint]
```

* **Backend**: FastAPI web server with a `concurrent.futures.ThreadPoolExecutor` running the inference loop in a dedicated worker thread.
* **Frontend**: Single-Page React App built with Vite, TypeScript, Material-UI (MUI), and TanStack React Query.

---

## 2. Backend Architecture & Concurrency

### 2.1 ThreadPoolExecutor (replaces raw threading.Thread)

The inference loop is submitted to a `concurrent.futures.ThreadPoolExecutor` (default `max_workers=1`):

- **Why 1 worker?** OpenVINO compiled inference requests are bound to the thread in which they are created (thread-affinity requirement). Using more than one worker would require separate model instances per thread.
- **Lifecycle**: The executor is created in the FastAPI lifespan startup block and shut down cleanly with `executor.shutdown(wait=True, cancel_futures=False)` during teardown, giving the inference loop time to finish its current frame.
- **Configuration**: `EXECUTOR_WORKERS` env var controls `max_workers`. Increase only for CPU-only (PyTorch) workloads where thread-affinity is not a concern.

### 2.2 Lifespan Context Manager

`@app.on_event("startup/shutdown")` has been replaced with the `@asynccontextmanager` lifespan pattern (FastAPI 0.93+):

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup ...
    yield
    # shutdown ...
```

This avoids the deprecation warning and makes startup/shutdown sequencing explicit.

### 2.3 Model Loading and Hardware Stability

1. **GPU OpenVINO Path** (`best_openvino_model/`): Probes for Intel iGPUs. A random noise warm-up validates the compiled model. If false detections occur (known hardware-affinity request pool bug), falls back to CPU.
2. **CPU PyTorch Path** (`best.pt`): Stable for sequential long-running inference. Used as the reliable fallback.

Model loading happens inside the executor worker thread (not the startup block) so that OpenVINO compiled request buffers are bound to the correct thread context.

`load_model()` is wrapped in `try/except`. Failures are emitted as structured JSON log entries before re-raising, preventing silent crashes on the executor thread.

### 2.4 Frame Queue & Backpressure

Frames arrive via WebSocket from the frontend and are pushed into a bounded `queue.Queue(maxsize=10)`.

**Drop-oldest policy** (`enqueue_frame()` helper in `inference.py`):
- If the queue is full, the oldest frame is evicted (`get_nowait()`) before the newest is inserted.
- Each drop increments `AppState.dropped_frames` — a cumulative counter.
- `dropped_frames` is exposed via `GET /health` and as a Prometheus gauge so operators can detect sustained queue pressure.
- The HTTP `/frame` endpoint returns **HTTP 429** when a frame is dropped, signalling the caller to back off.

**WebSocket backpressure (frontend)**:
- Before sending a frame, the frontend checks `ws.bufferedAmount`. If the browser's send buffer exceeds 64 KB, the frame is skipped. This prevents an unbounded in-memory queue building up in the browser.

### 2.5 WebSocket Broadcasting

Detection results are broadcast from the inference thread back to all connected WebSocket clients using `asyncio.run_coroutine_threadsafe()` to cross the thread/event-loop boundary:

```python
asyncio.run_coroutine_threadsafe(_broadcast(state, payload), state.ws_loop)
```

`state.ws_loop` is captured via `asyncio.get_running_loop()` during the lifespan startup (replaces the deprecated `get_event_loop()`).

---

## 3. Structured Logging

All log output is formatted as newline-delimited JSON via `python-json-logger`:

```json
{
  "timestamp": "2026-06-24T03:00:00",
  "level":     "INFO",
  "logger":    "inference",
  "message":   "best.pt CPU warm-up OK",
  "service":   "bray-ppe-backend"
}
```

Configuration:
- `configure_logging(level)` is called once at the top of `main.py` before the app is built.
- Log level controlled by `LOG_LEVEL` env var (default `"INFO"`).
- Output goes to `stdout`, making it directly ingestible by Grafana Loki, ELK, or AWS CloudWatch.

---

## 4. Metrics (Prometheus)

The `/metrics` endpoint is provided by `prometheus-fastapi-instrumentator` and exposes:

| Metric | Type | Description |
|:---|:---|:---|
| `http_requests_total` | Counter | Total HTTP requests by method, handler, status |
| `http_request_duration_seconds` | Histogram | Request latency buckets |
| `http_response_size_bytes` | Histogram | Response size distribution |
| `ppe_dropped_frames_total` | Gauge | Cumulative frames dropped due to queue overflow |

**Security Note — `/metrics` is unauthenticated.**
This is intentional for the current internal-network deployment where only trusted hosts (e.g., a Prometheus scraper on the same VLAN) can reach the server. If the backend is ever exposed to an untrusted network, restrict `/metrics` access at the reverse-proxy level:

```nginx
# Example nginx restriction
location /metrics {
    allow 10.0.0.0/8;
    deny  all;
    proxy_pass http://localhost:8000;
}
```

---

## 5. CORS

`allow_origins` reads from `settings.cors_allowed_origins` (env var `CORS_ALLOWED_ORIGINS`).

- **Default**: `["*"]` — safe for internal-network dev deployments.
- **Production**: set `CORS_ALLOWED_ORIGINS=https://ppe.bray.com` in `.env` to restrict to specific frontend origins.

---

## 6. API Endpoints

### 6.1 REST API

#### `GET /health`
* **Purpose**: Server health check with runtime telemetry.
* **Response**:
  ```json
  {
    "status":          "ok",
    "imgsz":           640,
    "iou":             0.45,
    "allowed_classes": ["boots", "glasses", "gloves", "helmet", "no boots", "..."],
    "dropped_frames":  0,
    "ws_client_count": 1,
    "executor_alive":  true
  }
  ```

#### `POST /active-classes`
* **Purpose**: Configures which PPE items are monitored during this session.
* **Payload**: `{"active_classes": ["helmet", "gloves"]}`
* **Behavior**: Expands base classes to include violation prefix (`no helmet`, `no gloves`) and commits atomically to `AppState.active_classes`.

#### `GET /status`
* **Purpose**: Snapshot of active detections and compliance boolean.

#### `GET /stream`
* **Purpose**: MJPEG stream with pre-rendered bounding boxes. Diagnostic fallback only.

#### `GET /metrics`
* **Purpose**: Prometheus scrape endpoint. See Section 4.

#### `POST /alarm/acknowledge`
* **Purpose**: Acknowledge alarm event (reserved for future session logging).

---

## 7. Frontend Hooks & State Flow

```
[App]
 └── QueryClientProvider (single instance, survives remounts)
      └── [LiveDetection]
           ├── useCamera       (Webcam streaming, video elements)
           ├── useBackend      (WebSocket connection state & socket communication)
           ├── useAlarm        (Speech synthesis voice alert — voice-only mode)
           └── useDetection    (WebSocket parsing, compliance matching, alarm triggers)
```

### 7.1 Environment Config (`src/app/config.ts`)

All `import.meta.env` reads are centralised in `config.ts`:
```ts
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
export const WS_URL      = import.meta.env.VITE_WS_URL;
```
Components and hooks import from this module instead of using `import.meta.env` inline.

### 7.2 Frame Capture — requestAnimationFrame

`setInterval(fn, 33)` has been replaced with a `requestAnimationFrame` loop:
- Capped at the display refresh rate (typically 60 fps).
- Automatically paused when the browser tab is hidden — prevents queue buildup during user inactivity.

### 7.3 Bounding Box Rendering

Frames are captured from the `<video>` element at 640px width, preserving the camera aspect ratio, and submitted as JPEG blobs over WebSocket. The canvas overlay rescales returned bounding box coordinates `[x1, y1, x2, y2]` proportionally to the visible CSS size of the video container. Bounding boxes are **not drawn for `person` detections** — person is used only to gate the alarm.

### 7.4 State Safety & TypeScript Compilation

WebSocket data payloads are mapped into typed state via `types.ts` interfaces (`Detection`, `DetectionFrame`, `PPEItem`). No raw JSON casting without structure validation.

---

## 8. Responsive Design

The dashboard uses a two-column MUI Grid layout:

| Breakpoint | Layout |
|:---|:---|
| `xs` (< 600 px) | Single column, full-width sidebar stacked above camera |
| `sm` (600–900 px) | Single column, responsive padding (`p: 2`) |
| `md` (≥ 900 px) | Two columns: `clamp(260px, 28vw, 340px)` sidebar + flexible camera panel |

Camera aspect ratio is `16:9` on mobile and `4:3` on desktop. AppBar height is defined by the `TOOLBAR_HEIGHT = 52` constant shared between the AppBar and the page content offset.
